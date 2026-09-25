import mongoose from 'mongoose';
import Workspace from '../models/Workspace.js';

export const ROLE_RANK = { viewer: 0, creator: 1, admin: 2, owner: 3 };

/**
 * Looks up a workspace and the given user's membership in it. `workspace`
 * is null if the id is malformed or doesn't exist; `membership` is null if
 * the user isn't a member.
 * @param {unknown} workspaceId
 * @param {string} userId
 */
export async function findWorkspaceMembership(workspaceId, userId) {
  if (!mongoose.isValidObjectId(workspaceId)) return { workspace: null, membership: null };
  const workspace = await Workspace.findById(workspaceId);
  const membership = workspace?.members.find((m) => m.user.toString() === String(userId)) ?? null;
  return { workspace, membership };
}

/**
 * Loads the caller's membership for the workspace named in
 * req.params.workspaceId, attaching it as req.workspace / req.membership.
 * 404 if the workspace doesn't exist, 403 if the caller isn't a member.
 */
export async function loadWorkspaceMembership(req, res, next) {
  const { workspace, membership } = await findWorkspaceMembership(req.params.workspaceId, req.user.id);
  if (!workspace) {
    return res.status(404).json({ success: false, message: 'Workspace not found' });
  }

  if (!membership) {
    return res.status(403).json({ success: false, message: 'Not a member of this workspace' });
  }

  req.workspace = workspace;
  req.membership = membership;
  next();
}

/**
 * Requires the caller's workspace role to be at least `minRole` in the
 * owner > admin > creator > viewer hierarchy. Must run after
 * loadWorkspaceMembership.
 * @param {'owner' | 'admin' | 'creator' | 'viewer'} minRole
 */
export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(500).json({ success: false, message: 'requireMinRole used without loadWorkspaceMembership' });
    }
    if (ROLE_RANK[req.membership.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ success: false, message: `Requires ${minRole} role or higher` });
    }
    next();
  };
}

/**
 * Requires the caller's role in their *active* workspace (set by protect or
 * apiKeyAuth as req.activeMembership) to be at least `minRole`.
 * @param {'owner' | 'admin' | 'creator' | 'viewer'} minRole
 */
export function requireActiveRole(minRole) {
  return (req, res, next) => {
    if (!req.activeMembership) {
      return res.status(500).json({ success: false, message: 'requireActiveRole used without an authenticated workspace' });
    }
    if (ROLE_RANK[req.activeMembership.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ success: false, message: `Requires ${minRole} role or higher in this workspace` });
    }
    next();
  };
}

export default { findWorkspaceMembership, loadWorkspaceMembership, requireMinRole, requireActiveRole };
