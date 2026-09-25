import Workspace from '../models/Workspace.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { revokeUserSessions } from '../utils/jwt.js';
import { ValidationError, ForbiddenError, ConflictError } from '../lib/errors.js';
import { loadOrganizationFor } from '../services/organizationAccess.js';

// WorkOS connection ids look like conn_01H8...; keep it strict so nothing
// else can be smuggled into the authorize URL built from it.
const CONNECTION_ID_PATTERN = /^conn_[A-Za-z0-9]{8,64}$/;
const SETTINGS_KEYS = ['ssoEnforced', 'ssoConnectionId'];

/** The SSO block returned to owners (settings endpoint and workspace detail). */
export function ssoSettingsPayload(org) {
  return {
    id: org._id,
    name: org.name,
    slug: org.slug,
    ssoConnectionId: org.ssoConnectionId ?? null,
    ssoEnforced: Boolean(org.ssoEnforced),
  };
}

function parseSettings(body) {
  const unknown = Object.keys(body ?? {}).filter((key) => !SETTINGS_KEYS.includes(key));
  if (unknown.length > 0) throw new ValidationError(`Unknown setting: ${unknown[0]}`);
  const { ssoEnforced, ssoConnectionId } = body ?? {};
  if (ssoEnforced === undefined && ssoConnectionId === undefined) throw new ValidationError('No settings to update');
  if (ssoEnforced !== undefined && typeof ssoEnforced !== 'boolean') throw new ValidationError('ssoEnforced must be true or false');
  if (ssoConnectionId !== undefined && ssoConnectionId !== null && typeof ssoConnectionId !== 'string') {
    throw new ValidationError('ssoConnectionId must be a string or null');
  }
  return { ssoEnforced, ssoConnectionId };
}

/**
 * PATCH /api/workspaces/organizations/:organizationId/sso-settings — owner
 * only ('sso:manage' in any of the org's workspaces).
 *
 * Enforcement needs a connection, and switching it on (or pointing an
 * enforced org at a different connection) needs the caller to be signed in
 * through that very connection right now: proof the IdP setup works, so
 * nobody gets locked out. Switching it on also ends every member's password
 * session. API keys are unaffected.
 */
export const updateSsoSettings = async (req, res) => {
  // 404 for non-members, then the org's IP allowlist, then owner-only.
  const org = await loadOrganizationFor(req, req.params.organizationId, 'sso:manage');

  const changes = parseSettings(req.body);
  const connectionId =
    changes.ssoConnectionId === undefined ? org.ssoConnectionId || null : changes.ssoConnectionId?.trim() || null;
  const enforced = changes.ssoEnforced ?? Boolean(org.ssoEnforced);

  if (connectionId && !CONNECTION_ID_PATTERN.test(connectionId)) {
    throw new ValidationError('ssoConnectionId must be a WorkOS connection id (conn_...)');
  }
  if (enforced && !connectionId) throw new ValidationError('Set an SSO connection before enforcing SSO');

  const turningOn = enforced && !org.ssoEnforced;
  const turningOff = !enforced && Boolean(org.ssoEnforced);
  const connectionChanged = connectionId !== (org.ssoConnectionId || null);

  if (enforced && (turningOn || connectionChanged)) {
    if (!env.SSO_ENABLED) throw new ConflictError('SSO is not enabled on this deployment, so it cannot be enforced');
    const session = req.sessionAuth;
    if (session?.authMethod !== 'sso' || session.ssoConnectionId !== connectionId) {
      throw new ForbiddenError(
        connectionChanged && org.ssoEnforced
          ? 'To change the connection of an enforced organization, turn enforcement off, save the new connection, sign in with SSO through it, then enforce again'
          : `Sign in with SSO through ${connectionId} before enforcing it, so a misconfigured connection can't lock everyone out`
      );
    }
  }

  org.ssoConnectionId = connectionId ?? undefined;
  org.ssoEnforced = enforced;
  try {
    await org.save();
  } catch (err) {
    if (err?.code === 11000) throw new ConflictError('That SSO connection is already used by another organization');
    throw err;
  }

  let revokedSessions = 0;
  if (turningOn) {
    const memberIds = await Workspace.find({ organization: org._id }).distinct('members.user');
    for (const memberId of memberIds) {
      revokedSessions += await revokeUserSessions(String(memberId), (auth) => auth.authMethod === 'password');
    }
    logger.info({ organizationId: String(org._id), revokedSessions }, 'SSO enforced; password sessions revoked');
  }

  const action = turningOn
    ? 'organization.sso.enforce'
    : turningOff
      ? 'organization.sso.unenforce'
      : connectionChanged
        ? 'organization.sso.update'
        : null;
  if (action) {
    // Org-level change: record it in each of the org's workspaces' activity.
    const workspaceIds = await Workspace.find({ organization: org._id }).distinct('_id');
    for (const workspace of workspaceIds) {
      logAudit({
        action,
        workspace,
        actorUserId: req.user.id,
        targetResourceId: String(org._id),
        ipAddress: getClientIp(req),
        diff: { connectionId, ...(turningOn && { revokedSessions }) },
      });
    }
  }

  res.status(200).json({ success: true, organization: ssoSettingsPayload(org), revokedSessions });
};

export default { updateSsoSettings, ssoSettingsPayload };
