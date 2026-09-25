import Workspace from '../models/Workspace.js';

export const ROLE_RANK = { viewer: 0, creator: 1, admin: 2, owner: 3 };

/**
 * Loads the caller's membership for the workspace named in
 * req.params.workspaceId, attaching it as req.workspace / req.membership.
 * 404 if the workspace doesn't exist, 403 if the caller isn't a member.
 */
export async function loadWorkspaceMembership(req, res, next) {
  const { workspaceId } = req.params;

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ success: false, message: 'Workspace not found' });
  }

  const membership = workspace.members.find((m) => m.user.toString() === req.user.id);
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

export default { loadWorkspaceMembership, requireMinRole, requireActiveRole };
