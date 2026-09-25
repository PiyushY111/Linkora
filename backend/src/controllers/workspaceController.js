import Organization from '../models/Organization.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import Link from '../models/Link.js';
import Webhook from '../models/Webhook.js';
import ApiKey from '../models/ApiKey.js';
import { logAudit } from '../utils/auditLogger.js';
import { normalizeAccountEmail } from '../utils/email.js';
import { getClientIp } from '../utils/helpers.js';
import { membershipCan, holdsAll, permissionDeniedMessage } from '../utils/permissions.js';
import { resolveRole, withPermissions, roleNamesFor } from '../services/roleService.js';
import { toActiveWorkspacePayload } from '../services/workspaceService.js';
import { ssoSettingsPayload } from './ssoController.js';
import { ipAllowlistPayload } from './ipAllowlistController.js';
import { auditSettingsPayload } from './auditController.js';
import { hashInviteToken, inviteUrl, deliverInviteEmail, upsertPendingInvite } from '../services/inviteService.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  GoneError,
  DirectoryManagedError,
} from '../lib/errors.js';
import DirectoryUser from '../models/DirectoryUser.js';
import { directorySyncPayload } from './directorySyncController.js';

function invitePayload(invite) {
  return {
    id: invite._id,
    email: invite.email,
    role: invite.role,
    invitedBy: invite.invitedBy,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}

/**
 * Validates `role` for the workspace's organization (a built-in role or one
 * of its custom roles) and applies the grant rule: the acting member must
 * hold every permission the role grants, and only an owner grants owner.
 * @param {{ permissions: string[] }} actor - the caller's resolved membership
 */
async function assertAssignableRole(role, workspace, actor) {
  const resolved = await resolveRole(role, workspace.organization);
  if (!resolved) {
    throw new ValidationError("role must be viewer, creator, admin, owner, or one of this organization's custom roles");
  }
  if (role === 'owner' && !membershipCan(actor, 'ownership:transfer')) {
    throw new ForbiddenError(permissionDeniedMessage('ownership:transfer'));
  }
  if (!holdsAll(actor.permissions, resolved.permissions)) {
    throw new ForbiddenError("You can't grant a role with permissions you don't have");
  }
  return resolved;
}

/**
 * The other half of the grant rule: changing or removing a member needs
 * every permission they currently hold, so a narrower role can't strip a
 * broader one. Owners additionally need 'ownership:transfer'.
 */
async function assertCanChangeMember(target, workspace, actor) {
  if (target.role === 'owner' && !membershipCan(actor, 'ownership:transfer')) {
    throw new ForbiddenError(permissionDeniedMessage('ownership:transfer'));
  }
  const current = await resolveRole(target.role, workspace.organization);
  if (current && !holdsAll(actor.permissions, current.permissions)) {
    throw new ForbiddenError("You can't change a member who has permissions you don't have");
  }
}

/**
 * Refuses to hand-add or invite someone the organization's directory
 * already tracks: their membership comes from the identity provider (see
 * services/directorySyncService.js). Role changes stay manual, since the
 * directory doesn't send roles.
 */
async function assertNotDirectoryManaged(workspace, email) {
  if (await DirectoryUser.exists({ organization: workspace.organization, email })) {
    throw new DirectoryManagedError();
  }
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Create an organization + a default workspace, with the caller as owner.
export const createOrganization = async (req, res) => {
  const { name, workspaceName } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });

  const org = await Organization.create({ name, slug: `${slugify(name)}-${Date.now().toString(36)}`, owner: req.user.id });
  const finalWorkspaceName = workspaceName || (name.trim().toLowerCase() === 'personal' ? 'Personal' : 'Main');
  const workspace = await Workspace.create({
    organization: org._id,
    name: finalWorkspaceName,
    members: [{ user: req.user.id, role: 'owner' }],
  });

  logAudit({ action: 'organization.create', workspace: workspace._id, actorUserId: req.user.id, targetResourceId: String(org._id), ipAddress: getClientIp(req) });

  res.status(201).json({ success: true, organization: org, workspace });
};

// List workspaces the caller belongs to. Pending invites are excluded (this
// is visible to every member, and .lean() skips the toJSON transform), and so
// is the QR style default, which can carry a sizeable logo image.
export const listMyWorkspaces = async (req, res) => {
  const workspaces = await Workspace.find({ 'members.user': req.user.id })
    .select('-pendingInvites -defaultQrStyle')
    .populate('organization')
    .lean();
  // Custom role ids -> names, so role badges can show a name.
  const roleNames = await roleNamesFor(workspaces.flatMap((w) => w.members.map((m) => m.role)));
  res.status(200).json({ success: true, workspaces, roleNames });
};

export const getWorkspace = async (req, res) => {
  // req.workspace (from loadWorkspaceMembership) is intentionally
  // unpopulated so membership.user.toString() comparisons keep working;
  // populate a fresh copy here purely for display.
  const populated = await Workspace.findById(req.workspace._id)
    .populate('members.user', 'name email')
    .populate('pendingInvites.invitedBy', 'name email');
  const workspace = populated.toJSON();

  // Only admins manage invites; others don't see who's been invited.
  const canManageInvites = membershipCan(req.membership, 'members:manage');
  const now = Date.now();
  workspace.pendingInvites = canManageInvites
    ? workspace.pendingInvites.filter((i) => new Date(i.expiresAt).getTime() > now).map(invitePayload)
    : [];

  // Owners also get the organization's SSO settings, and how their own
  // session signed in (enforcing SSO requires an SSO session through it).
  // Likewise the IP allowlist, with the IP they're connecting from.
  let organizationSso;
  let organizationIpAllowlist;
  let organizationAudit;
  let organizationDirectorySync;
  const ownerBlocks = ['sso:manage', 'ipAllowlist:manage', 'auditSettings:manage', 'directorySync:manage'];
  if (ownerBlocks.some((action) => membershipCan(req.membership, action))) {
    const org = await Organization.findById(req.workspace.organization).lean();
    if (org && membershipCan(req.membership, 'directorySync:manage')) {
      organizationDirectorySync = await directorySyncPayload(org);
    }
    if (org && membershipCan(req.membership, 'auditSettings:manage')) {
      organizationAudit = { organizationId: org._id, organizationName: org.name, ...auditSettingsPayload(org) };
    }
    if (org && membershipCan(req.membership, 'sso:manage')) {
      organizationSso = { ...ssoSettingsPayload(org), yourSession: req.sessionAuth };
    }
    if (org && membershipCan(req.membership, 'ipAllowlist:manage')) {
      organizationIpAllowlist = { organizationId: org._id, organizationName: org.name, ...ipAllowlistPayload(org, req) };
    }
  }

  // permissions: what the caller's role allows here (this may not be their
  // active workspace, so the activeWorkspace payload's list doesn't apply).
  const roleNames = await roleNamesFor([
    ...workspace.members.map((m) => m.role),
    ...workspace.pendingInvites.map((i) => i.role),
  ]);

  const [linksCount, webhooksCount, apiKeysCount, clicksAgg] = await Promise.all([
    Link.countDocuments({ workspace: req.workspace._id }),
    Webhook.countDocuments({ workspace: req.workspace._id }),
    ApiKey.countDocuments({ workspace: req.workspace._id }),
    Link.aggregate([
      { $match: { workspace: req.workspace._id } },
      { $group: { _id: null, totalClicks: { $sum: '$clicks' } } },
    ]),
  ]);
  const stats = {
    linksCount,
    webhooksCount,
    apiKeysCount,
    clicksCount: clicksAgg[0]?.totalClicks || 0,
    membersCount: workspace.members.length,
  };

  res.status(200).json({
    success: true,
    workspace,
    stats,
    role: req.membership.role,
    roleName: req.membership.roleName,
    permissions: req.membership.permissions,
    roleNames,
    ...(organizationSso && { organizationSso }),
    ...(organizationIpAllowlist && { organizationIpAllowlist }),
    ...(organizationAudit && { organizationAudit }),
    ...(organizationDirectorySync && { organizationDirectorySync }),
  });
};

// Add or update a member's role (built-in or custom). Requires
// 'members:manage' (route) plus the grant rule: see assertAssignableRole and
// assertCanChangeMember.
export const upsertMember = async (req, res) => {
  const { email, role } = req.body;
  const { workspace } = req;

  await assertAssignableRole(role, workspace, req.membership);

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const existing = workspace.members.find((m) => m.user.toString() === String(user._id));
  if (existing) await assertCanChangeMember(existing, workspace, req.membership);
  else await assertNotDirectoryManaged(workspace, user.email);

  if (existing) {
    existing.role = role;
  } else {
    workspace.members.push({ user: user._id, role });
  }
  await workspace.save();

  logAudit({
    action: 'workspace.member.upsert',
    workspace: workspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { member: user.email, role },
  });

  res.status(200).json({ success: true, workspace });
};

// Remove a member. Requires 'members:manage' and every permission the member
// holds; only an owner can remove another owner.
export const removeMember = async (req, res) => {
  const { userId } = req.params;
  const { workspace } = req;

  const target = workspace.members.find((m) => m.user.toString() === userId);
  if (!target) return res.status(404).json({ success: false, message: 'Member not found' });
  if (target.managedBy === 'scim') throw new DirectoryManagedError();

  await assertCanChangeMember(target, workspace, req.membership);

  workspace.members = workspace.members.filter((m) => m.user.toString() !== userId);
  await workspace.save();

  logAudit({
    action: 'workspace.member.remove',
    workspace: workspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { removedUser: userId },
  });

  res.status(200).json({ success: true, workspace });
};

/**
 * Invite someone to the workspace by email. Requires admin+ (route). Always
 * creates a pending invite, even for an email that already has an account,
 * so the response never reveals whether an account exists and nobody is
 * added without accepting. Inviting an email that already has a pending
 * invite replaces it (new token, fresh expiry): that's the resend.
 */
export const createInvite = async (req, res) => {
  const { workspace, membership } = req;
  const email = normalizeAccountEmail(req.body.email);
  const { role } = req.body;

  if (!email) throw new ValidationError('A valid email is required');
  await assertAssignableRole(role, workspace, membership);
  await assertNotDirectoryManaged(workspace, email);

  const memberIds = workspace.members.map((m) => m.user);
  if (await User.exists({ _id: { $in: memberIds }, email })) {
    throw new ConflictError('That person is already a member of this workspace');
  }

  const { invite, token, resent } = await upsertPendingInvite(workspace._id, { email, role, invitedBy: req.user._id });
  const url = inviteUrl(token);

  const { delivered } = await deliverInviteEmail({
    to: email,
    url,
    workspaceName: workspace.name,
    inviterName: req.user.name,
    role,
    inviteId: String(invite._id),
  });

  logAudit({
    action: 'workspace.invite.create',
    workspace: workspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { inviteId: String(invite._id), email, role, resent },
  });

  res.status(201).json({ success: true, invite: invitePayload(invite), inviteUrl: url, emailSent: delivered, resent });
};

/**
 * Finds the workspace holding the invite for this raw token, projecting just
 * that invite. Throws 404 if there's none and 410 if it has expired.
 */
async function findInviteByToken(token) {
  const tokenHash = hashInviteToken(token);
  const workspace = await Workspace.findOne(
    { 'pendingInvites.tokenHash': tokenHash },
    {
      name: 1,
      organization: 1,
      defaultDomain: 1,
      defaultQrStyle: 1,
      defaultUtmParams: 1,
      pendingInvites: { $elemMatch: { tokenHash } },
    }
  )
    .populate('organization', 'name')
    .lean();

  const invite = workspace?.pendingInvites?.[0];
  if (!invite) throw new NotFoundError('Invite not found');
  if (invite.expiresAt.getTime() <= Date.now()) throw new GoneError('This invite has expired');
  return { workspace, invite, tokenHash };
}

// Public: what an invite link is for, so the landing page can say
// "you've been invited to X as Y" before the invitee signs in.
export const getInvite = async (req, res) => {
  const { workspace, invite } = await findInviteByToken(req.params.token);
  const role = await resolveRole(invite.role, workspace.organization?._id ?? workspace.organization);
  res.status(200).json({
    success: true,
    invite: {
      workspace: { name: workspace.name },
      organization: { name: workspace.organization?.name ?? '' },
      role: invite.role,
      roleName: role?.roleName ?? invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
    },
  });
};

/**
 * Accept an invite as the signed-in user, whose email must be the one
 * invited. Joining and consuming the invite are one conditional update, so
 * a token can't be redeemed twice. The workspace becomes the caller's
 * active one.
 */
export const acceptInvite = async (req, res) => {
  const { workspace, invite, tokenHash } = await findInviteByToken(req.params.token);

  if (normalizeAccountEmail(req.user.email) !== invite.email) {
    throw new ForbiddenError('This invite was sent to a different email address');
  }

  const joined = await Workspace.updateOne(
    {
      _id: workspace._id,
      'members.user': { $ne: req.user._id },
      pendingInvites: { $elemMatch: { tokenHash, expiresAt: { $gt: new Date() } } },
    },
    {
      $pull: { pendingInvites: { tokenHash } },
      $push: { members: { user: req.user._id, role: invite.role } },
    }
  );

  if (joined.modifiedCount === 0) {
    const alreadyMember = await Workspace.exists({ _id: workspace._id, 'members.user': req.user._id });
    if (alreadyMember) throw new ConflictError("You're already a member of this workspace");
    throw new NotFoundError('Invite not found');
  }

  await User.updateOne({ _id: req.user._id }, { $set: { activeWorkspace: workspace._id } });

  logAudit({
    action: 'workspace.invite.accept',
    workspace: workspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { inviteId: String(invite._id), role: invite.role },
  });

  res.status(200).json({
    success: true,
    activeWorkspace: toActiveWorkspacePayload(
      workspace,
      await withPermissions({ user: req.user._id, role: invite.role }, workspace.organization?._id ?? workspace.organization)
    ),
  });
};

// Revoke a pending invite by its id. Requires admin+ (route).
export const revokeInvite = async (req, res) => {
  const { workspace } = req;
  const { inviteId } = req.params;

  const invite = workspace.pendingInvites.find((i) => String(i._id) === inviteId);
  if (!invite) throw new NotFoundError('Invite not found');

  await Workspace.updateOne({ _id: workspace._id }, { $pull: { pendingInvites: { _id: invite._id } } });

  logAudit({
    action: 'workspace.invite.revoke',
    workspace: workspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { inviteId, email: invite.email },
  });

  res.status(200).json({ success: true, message: 'Invite revoked' });
};

export default {
  createOrganization,
  listMyWorkspaces,
  getWorkspace,
  upsertMember,
  removeMember,
  createInvite,
  getInvite,
  acceptInvite,
  revokeInvite,
};
