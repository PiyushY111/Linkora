import mongoose from 'mongoose';
import Workspace from '../models/Workspace.js';
import { membershipCan, permissionDeniedMessage, requiredRole } from '../utils/permissions.js';
import { withPermissions } from '../services/roleService.js';
import { assertOrganizationIpAllowed } from '../services/organizationAccess.js';

/**
 * Looks up a workspace and the given user's membership in it. `workspace`
 * is null if the id is malformed or doesn't exist; `membership` is null if
 * the user isn't a member, and otherwise resolved (roleService.withPermissions):
 * { user, role, roleName, permissions }.
 * @param {unknown} workspaceId
 * @param {string} userId
 */
export async function findWorkspaceMembership(workspaceId, userId) {
  if (!mongoose.isValidObjectId(workspaceId)) return { workspace: null, membership: null };
  const workspace = await Workspace.findById(workspaceId);
  const raw = workspace?.members.find((m) => m.user.toString() === String(userId)) ?? null;
  return { workspace, membership: raw ? await withPermissions(raw, workspace.organization) : null };
}

/**
 * Loads the caller's membership for the workspace named in
 * req.params.workspaceId, attaching it as req.workspace / req.membership.
 * 404 if the workspace doesn't exist, 403 if the caller isn't a member or
 * their IP isn't on the organization's allowlist.
 */
export async function loadWorkspaceMembership(req, res, next) {
  const { workspace, membership } = await findWorkspaceMembership(req.params.workspaceId, req.user.id);
  if (!workspace) {
    return res.status(404).json({ success: false, message: 'Workspace not found' });
  }

  if (!membership) {
    return res.status(403).json({ success: false, message: 'Not a member of this workspace' });
  }

  await assertOrganizationIpAllowed(req, workspace.organization);

  req.workspace = workspace;
  req.membership = membership;
  next();
}

/**
 * Every request that acts in a workspace goes through one of these guards
 * (or loadWorkspaceMembership), which is where the organization's IP
 * allowlist is enforced. Account-level routes (profile, switching the
 * active workspace, logout) don't act in a workspace, so a member outside
 * the allowed range can still switch to another workspace.
 */
function permissionGuard(action, pickMembership, pickWorkspace, wiring) {
  // Resolve now so a typo'd action fails at startup, not on first request.
  requiredRole(action);
  return async (req, res, next) => {
    const membership = pickMembership(req);
    const workspace = pickWorkspace(req);
    if (!membership || !workspace) {
      // Route wiring bug, not a client error: let the error handler log it.
      return next(new Error(`Permission check for '${action}' ran without ${wiring}`));
    }
    await assertOrganizationIpAllowed(req, workspace.organization);
    if (!membershipCan(membership, action)) {
      return res.status(403).json({ success: false, message: permissionDeniedMessage(action) });
    }
    next();
  };
}

/**
 * Requires the caller's role in their *active* workspace (req.activeMembership,
 * set by protect or apiKeyAuth) to allow `action` per utils/permissions.js.
 * @param {string} action - a key of PERMISSIONS
 */
export function requirePermission(action) {
  return permissionGuard(action, (req) => req.activeMembership, (req) => req.activeWorkspace, 'protect/apiKeyAuth');
}

/**
 * Same, for the workspace named in the URL (req.membership). Must run after
 * loadWorkspaceMembership.
 * @param {string} action - a key of PERMISSIONS
 */
export function requireWorkspacePermission(action) {
  return permissionGuard(action, (req) => req.membership, (req) => req.workspace, 'loadWorkspaceMembership');
}

export default { findWorkspaceMembership, loadWorkspaceMembership, requirePermission, requireWorkspacePermission };
