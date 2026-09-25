import mongoose from 'mongoose';
import Workspace from '../models/Workspace.js';
import DirectoryUser from '../models/DirectoryUser.js';
import { env } from '../config/env.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { ValidationError, ConflictError } from '../lib/errors.js';
import { loadOrganizationFor } from '../services/organizationAccess.js';
import { resolveRole } from '../services/roleService.js';

// WorkOS directory ids look like directory_01H8...; kept strict.
const DIRECTORY_ID_PATTERN = /^directory_[A-Za-z0-9]{8,64}$/;
const SETTINGS_KEYS = ['enabled', 'directoryId', 'defaultRole', 'workspaceId'];

/** The directory-sync block returned to owners (settings response and workspace detail). */
export async function directorySyncPayload(org) {
  const settings = org.directorySync ?? {};
  const [defaultRole, counts] = await Promise.all([
    resolveRole(settings.defaultRole ?? 'creator', org._id),
    DirectoryUser.aggregate([{ $match: { organization: org._id } }, { $group: { _id: '$state', n: { $sum: 1 } } }]),
  ]);
  return {
    organizationId: org._id,
    organizationName: org.name,
    enabled: Boolean(settings.enabled),
    directoryId: settings.directoryId ?? null,
    defaultRole: settings.defaultRole ?? 'creator',
    defaultRoleName: defaultRole?.roleName ?? 'viewer',
    workspaceId: settings.workspace ?? null,
    lastEventAt: settings.lastEventAt ?? null,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    // Whether this deployment can receive directory events at all.
    serverConfigured: Boolean(env.WORKOS_WEBHOOK_SECRET),
    webhookPath: '/api/auth/sso/scim/events',
  };
}

/**
 * PATCH /api/workspaces/organizations/:organizationId/directory-sync —
 * owner only ('directorySync:manage'), from an allowed IP. Body (all
 * optional): { enabled, directoryId, defaultRole, workspaceId }.
 * Enabling needs a directory id and a deployment with the WorkOS webhook
 * secret. The default role can be any built-in role but owner, or one of
 * the org's custom roles.
 */
export const updateDirectorySync = async (req, res) => {
  const org = await loadOrganizationFor(req, req.params.organizationId, 'directorySync:manage');
  const body = req.body ?? {};
  const unknown = Object.keys(body).filter((key) => !SETTINGS_KEYS.includes(key));
  if (unknown.length > 0) throw new ValidationError(`Unknown setting: ${unknown[0]}`);
  if (Object.keys(body).length === 0) throw new ValidationError('No settings to update');

  const current = org.directorySync ?? {};
  const next = {
    enabled: body.enabled ?? Boolean(current.enabled),
    directoryId: body.directoryId === undefined ? current.directoryId ?? null : body.directoryId?.trim() || null,
    defaultRole: body.defaultRole ?? current.defaultRole ?? 'creator',
    workspace: body.workspaceId === undefined ? current.workspace ?? null : body.workspaceId || null,
  };

  if (typeof next.enabled !== 'boolean') throw new ValidationError('enabled must be true or false');
  if (next.directoryId && !DIRECTORY_ID_PATTERN.test(next.directoryId)) {
    throw new ValidationError('directoryId must be a WorkOS directory id (directory_...)');
  }
  if (next.defaultRole === 'owner' || !(await resolveRole(next.defaultRole, org._id))) {
    throw new ValidationError("defaultRole must be viewer, creator, admin, or one of this organization's custom roles");
  }
  if (next.workspace) {
    if (!mongoose.isValidObjectId(next.workspace) || !(await Workspace.exists({ _id: next.workspace, organization: org._id }))) {
      throw new ValidationError('workspaceId must be a workspace in this organization');
    }
  }
  if (next.enabled && !next.directoryId) throw new ValidationError('Set the directory id before enabling directory sync');
  if (next.enabled && !env.WORKOS_WEBHOOK_SECRET) {
    throw new ConflictError('Directory sync is not configured on this deployment (WORKOS_WEBHOOK_SECRET is missing)');
  }

  const before = {
    enabled: Boolean(current.enabled),
    directoryId: current.directoryId ?? null,
    defaultRole: current.defaultRole ?? 'creator',
    workspace: current.workspace ? String(current.workspace) : null,
  };
  org.set('directorySync.enabled', next.enabled);
  org.set('directorySync.directoryId', next.directoryId ?? undefined);
  org.set('directorySync.defaultRole', next.defaultRole);
  org.set('directorySync.workspace', next.workspace ?? undefined);
  try {
    await org.save();
  } catch (err) {
    if (err?.code === 11000) throw new ConflictError('That directory is already connected to another organization');
    throw err;
  }

  const after = { ...next, workspace: next.workspace ? String(next.workspace) : null };
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const workspaceIds = await Workspace.find({ organization: org._id }).distinct('_id');
    for (const workspace of workspaceIds) {
      logAudit({
        action: 'organization.directory_sync.update',
        workspace,
        actorUserId: req.user.id,
        targetResourceId: String(org._id),
        ipAddress: getClientIp(req),
        diff: { before, after },
      });
    }
  }

  res.status(200).json({ success: true, directorySync: await directorySyncPayload(org) });
};

export default { updateDirectorySync, directorySyncPayload };
