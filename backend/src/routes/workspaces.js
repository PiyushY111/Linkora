import express from 'express';
import {
  createOrganization,
  listMyWorkspaces,
  getWorkspace,
  upsertMember,
  removeMember,
  createInvite,
  getInvite,
  acceptInvite,
  revokeInvite,
} from '../controllers/workspaceController.js';
import { updateSettings, listActivity, transferOwnership } from '../controllers/workspaceAdminController.js';
import { updateSsoSettings } from '../controllers/ssoController.js';
import { updateIpAllowlist } from '../controllers/ipAllowlistController.js';
import { exportActivity, updateAuditSettings } from '../controllers/auditController.js';
import { updateDirectorySync } from '../controllers/directorySyncController.js';
import { listRoles, createRole, updateRole, deleteRole } from '../controllers/customRoleController.js';
import { getBioPageAnalytics } from '../controllers/bioPageAnalyticsController.js';
import { protect } from '../middleware/auth.js';
import { loadWorkspaceMembership, requireWorkspacePermission } from '../middleware/rbac.js';
import { inviteRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/organizations', protect, createOrganization);
// Owner-only org settings ('sso:manage' / 'ipAllowlist:manage' /
// 'auditSettings:manage' / 'directorySync:manage' in any of the org's
// workspaces, from an allowed IP),
// checked in the controllers.
router.patch('/organizations/:organizationId/sso-settings', protect, updateSsoSettings);
router.patch('/organizations/:organizationId/ip-allowlist', protect, updateIpAllowlist);
router.patch('/organizations/:organizationId/audit-settings', protect, updateAuditSettings);
router.patch('/organizations/:organizationId/directory-sync', protect, updateDirectorySync);

// Invite links. The lookup is public so the landing page can describe the
// invite before the invitee has signed in; accepting requires a session.
router.get('/invites/:token', inviteRateLimiter, getInvite);
router.post('/invites/:token/accept', inviteRateLimiter, protect, acceptInvite);

router.get('/', protect, listMyWorkspaces);
router.get('/:workspaceId', protect, loadWorkspaceMembership, getWorkspace);
// Owner-only role changes (granting owner, touching an owner) are checked
// in the controllers with 'ownership:transfer'.
const canManageMembers = [protect, loadWorkspaceMembership, requireWorkspacePermission('members:manage')];

router.post('/:workspaceId/members', canManageMembers, upsertMember);
router.delete('/:workspaceId/members/:userId', canManageMembers, removeMember);
router.post('/:workspaceId/invites', canManageMembers, createInvite);
router.delete('/:workspaceId/invites/:inviteId', canManageMembers, revokeInvite);

const inWorkspace = [protect, loadWorkspaceMembership];

// Custom roles belong to the workspace's organization. Anyone in the
// workspace can list them (their names appear in member lists); changing
// them is 'roles:manage', plus the grant rule in the controller.
const canManageRoles = requireWorkspacePermission('roles:manage');
router.get('/:workspaceId/roles', inWorkspace, listRoles);
router.post('/:workspaceId/roles', inWorkspace, canManageRoles, createRole);
router.patch('/:workspaceId/roles/:roleId', inWorkspace, canManageRoles, updateRole);
router.delete('/:workspaceId/roles/:roleId', inWorkspace, canManageRoles, deleteRole);
router.patch('/:workspaceId/settings', inWorkspace, requireWorkspacePermission('settings:manage'), updateSettings);
router.get('/:workspaceId/activity', inWorkspace, requireWorkspacePermission('activity:read'), listActivity);
router.get('/:workspaceId/activity/export', inWorkspace, requireWorkspacePermission('activity:read'), exportActivity);
// Same permission as the other analytics endpoints (routes/analytics.js).
router.get(
  '/:workspaceId/bio-page/analytics',
  inWorkspace,
  requireWorkspacePermission('analytics:read'),
  getBioPageAnalytics
);
router.post(
  '/:workspaceId/transfer-ownership',
  inWorkspace,
  requireWorkspacePermission('ownership:transfer'),
  transferOwnership
);

export default router;
