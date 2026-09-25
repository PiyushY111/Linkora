import crypto from 'crypto';
import Organization from '../models/Organization.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import ApiKey from '../models/ApiKey.js';
import DirectoryUser from '../models/DirectoryUser.js';
import { logger } from '../config/logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { normalizeAccountEmail } from '../utils/email.js';
import { revokeUserSessions } from '../utils/jwt.js';
import { resolveRole } from './roleService.js';
import { upsertPendingInvite } from './inviteService.js';

/**
 * Automatic provisioning from an organization's identity provider through
 * WorkOS Directory Sync (SCIM), consistent with the WorkOS SSO integration
 * in ssoService.js. WorkOS delivers signed `dsync.user.*` webhook events;
 * each handler is idempotent (WorkOS retries deliveries) and ignores events
 * older than the last one applied for that directory user.
 */

export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const FALLBACK_ROLE = 'viewer';

/**
 * Verifies a `WorkOS-Signature: t=<ms>, v1=<hex>` header: HMAC-SHA256 of
 * "<t>.<raw body>" with the endpoint's secret, and a timestamp within
 * SIGNATURE_TOLERANCE_MS (replay window). Constant-time comparison.
 * @param {Buffer | string} rawBody - exactly the bytes received
 * @param {string | undefined} header
 * @param {string} secret
 */
export function verifyWorkOSSignature(rawBody, header, secret, now = Date.now()) {
  if (!secret || typeof header !== 'string') return false;
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')];
    })
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1 || Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_MS) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const given = Buffer.from(parts.v1, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

/** The directory user's primary email, normalized like every account email. */
function primaryEmail(data) {
  const primary = data.email ?? data.emails?.find((e) => e.primary)?.value ?? data.emails?.[0]?.value;
  return normalizeAccountEmail(primary);
}

async function targetWorkspace(org) {
  if (org.directorySync?.workspace) {
    const chosen = await Workspace.findOne({ _id: org.directorySync.workspace, organization: org._id });
    if (chosen) return chosen;
  }
  return Workspace.findOne({ organization: org._id }).sort({ createdAt: 1 });
}

/** The configured default role, if it still resolves in this org; otherwise viewer. */
async function defaultRoleFor(org) {
  const configured = org.directorySync?.defaultRole;
  if (configured && configured !== 'owner' && (await resolveRole(configured, org._id))) return configured;
  return FALLBACK_ROLE;
}

function audit(action, workspaceId, org, diff) {
  logAudit({ action, workspace: workspaceId, targetResourceId: String(org._id), diff });
}

/**
 * user.created / user.updated (active): make sure the directory user is in
 * the org's workspace.
 * - A new email gets an account (provisionedBy 'scim', random unusable
 *   password; they sign in with SSO) and an IdP-managed membership.
 * - An email that already has a Linkora account gets a normal invite to
 *   accept instead, so a directory can't pull in someone's existing account
 *   without their consent.
 * - An account that's already a member is just linked.
 */
async function provision(org, data, eventAt) {
  const email = primaryEmail(data);
  if (!email) return 'ignored:no_email';
  const workspace = await targetWorkspace(org);
  if (!workspace) return 'ignored:no_workspace';

  const mapping = await DirectoryUser.findOne({ organization: org._id, directoryUserId: data.id });
  let userId = mapping?.state !== 'deprovisioned' ? mapping?.user : null;
  let state = mapping?.state === 'deprovisioned' ? null : mapping?.state;
  let outcome = 'unchanged';

  if (!userId) {
    const existing = await User.findOne({ email });
    if (!existing) {
      const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || email;
      const user = await User.create({
        name: name.slice(0, 50),
        email,
        password: crypto.randomBytes(32).toString('hex'), // unusable; they sign in with SSO
        isVerified: true,
        provisionedBy: 'scim',
        activeWorkspace: workspace._id,
      });
      await Workspace.updateOne(
        { _id: workspace._id, 'members.user': { $ne: user._id } },
        { $push: { members: { user: user._id, role: await defaultRoleFor(org), managedBy: 'scim' } } }
      );
      userId = user._id;
      state = 'provisioned';
      outcome = 'provisioned';
      audit('directory.user.provision', workspace._id, org, { email, directoryUserId: data.id });
    } else if (
      existing.provisionedBy === 'scim' &&
      mapping?.state === 'deprovisioned' &&
      String(mapping.user) === String(existing._id)
    ) {
      // Reactivated in the directory: this is the account the directory
      // created, so restore its IdP-managed membership rather than invite it.
      await Workspace.updateOne(
        { _id: workspace._id, 'members.user': { $ne: existing._id } },
        { $push: { members: { user: existing._id, role: await defaultRoleFor(org), managedBy: 'scim' } } }
      );
      userId = existing._id;
      state = 'provisioned';
      outcome = 'provisioned';
      audit('directory.user.provision', workspace._id, org, { email, directoryUserId: data.id, reactivated: true });
    } else if (workspace.members.some((m) => String(m.user) === String(existing._id))) {
      userId = existing._id;
      state = 'linked';
      outcome = 'linked';
    } else {
      const inviter = org.owner;
      await upsertPendingInvite(workspace._id, { email, role: await defaultRoleFor(org), invitedBy: inviter });
      userId = existing._id;
      state = 'invited';
      outcome = 'invited';
      audit('directory.user.invite', workspace._id, org, { email, directoryUserId: data.id });
    }
  } else if (state === 'provisioned') {
    // Re-add an IdP-managed membership if it went missing (e.g. an earlier
    // deprovision was followed by reactivation in the directory).
    const added = await Workspace.updateOne(
      { _id: workspace._id, 'members.user': { $ne: userId } },
      { $push: { members: { user: userId, role: await defaultRoleFor(org), managedBy: 'scim' } } }
    );
    if (added.modifiedCount > 0) outcome = 'provisioned';
  }

  // Keep a directory-created account's name in step with the directory.
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ');
  if (name) await User.updateOne({ _id: userId, provisionedBy: 'scim' }, { $set: { name: name.slice(0, 50) } });

  await DirectoryUser.updateOne(
    { organization: org._id, directoryUserId: data.id },
    { $set: { directoryId: data.directory_id, email, user: userId, state, lastEventAt: eventAt } },
    { upsert: true }
  );
  return outcome;
}

/**
 * user.deleted, or updated to inactive: deactivate them in this org only.
 * Their memberships in the org's workspaces and pending invites there are
 * removed, API keys they created there are revoked, and their sessions are
 * signed out. The account itself, their other organizations, and the
 * workspace-owned links they created are kept (not hard-deleted). A
 * workspace's last owner is never removed; that's logged instead.
 */
async function deprovision(org, data, eventAt) {
  const mapping = await DirectoryUser.findOne({ organization: org._id, directoryUserId: data.id });
  if (!mapping?.user || mapping.state === 'deprovisioned') {
    if (mapping) await DirectoryUser.updateOne({ _id: mapping._id }, { $set: { lastEventAt: eventAt } });
    return 'ignored:unknown_user';
  }
  const userId = mapping.user;

  const workspaces = await Workspace.find({ organization: org._id });
  const workspaceIds = workspaces.map((w) => w._id);
  for (const workspace of workspaces) {
    const member = workspace.members.find((m) => String(m.user) === String(userId));
    const owners = workspace.members.filter((m) => m.role === 'owner');
    if (member?.role === 'owner' && owners.length === 1) {
      logger.warn({ workspaceId: String(workspace._id) }, 'Directory deprovision kept the last owner of a workspace');
      audit('directory.user.deprovision_skipped', workspace._id, org, { email: mapping.email, reason: 'last owner' });
      continue;
    }
    await Workspace.updateOne(
      { _id: workspace._id },
      { $pull: { members: { user: userId }, pendingInvites: { email: mapping.email } } }
    );
    if (member) audit('directory.user.deprovision', workspace._id, org, { email: mapping.email, directoryUserId: data.id });
  }

  await ApiKey.updateMany({ user: userId, workspace: { $in: workspaceIds }, status: 'active' }, { $set: { status: 'revoked' } });
  await revokeUserSessions(String(userId), () => true);
  await DirectoryUser.updateOne({ _id: mapping._id }, { $set: { state: 'deprovisioned', lastEventAt: eventAt } });
  return 'deprovisioned';
}

/**
 * Applies one verified WorkOS event. Unknown event types, directories that
 * no org has enabled, and stale (out-of-order) events are acknowledged but
 * ignored, so WorkOS doesn't keep retrying them.
 * @param {{ id?: string, event: string, data: object, created_at?: string }} event
 * @returns {Promise<string>} what happened, for the response and logs
 */
export async function handleDirectoryEvent(event) {
  const type = event?.event;
  const data = event?.data;
  if (!['dsync.user.created', 'dsync.user.updated', 'dsync.user.deleted'].includes(type) || !data?.id || !data.directory_id) {
    return 'ignored:unsupported';
  }

  const org = await Organization.findOne({ 'directorySync.directoryId': data.directory_id, 'directorySync.enabled': true });
  if (!org) return 'ignored:directory_not_enabled';

  const eventAt = new Date(event.created_at ?? data.updated_at ?? Date.now());
  const mapping = await DirectoryUser.findOne({ organization: org._id, directoryUserId: data.id }).select('lastEventAt').lean();
  if (mapping && mapping.lastEventAt > eventAt) return 'ignored:stale';

  await Organization.updateOne({ _id: org._id }, { $set: { 'directorySync.lastEventAt': new Date() } });

  const active = type !== 'dsync.user.deleted' && (data.state ?? 'active') === 'active';
  return active ? provision(org, data, eventAt) : deprovision(org, data, eventAt);
}

export default { SIGNATURE_TOLERANCE_MS, verifyWorkOSSignature, handleDirectoryEvent };
