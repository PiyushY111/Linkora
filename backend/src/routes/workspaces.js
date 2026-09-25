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
import { protect } from '../middleware/auth.js';
import { loadWorkspaceMembership, requireMinRole } from '../middleware/rbac.js';
import { inviteRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/organizations', protect, createOrganization);

// Invite links. The lookup is public so the landing page can describe the
// invite before the invitee has signed in; accepting requires a session.
router.get('/invites/:token', inviteRateLimiter, getInvite);
router.post('/invites/:token/accept', inviteRateLimiter, protect, acceptInvite);

router.get('/', protect, listMyWorkspaces);
router.get('/:workspaceId', protect, loadWorkspaceMembership, getWorkspace);
router.post('/:workspaceId/members', protect, loadWorkspaceMembership, requireMinRole('admin'), upsertMember);
router.delete('/:workspaceId/members/:userId', protect, loadWorkspaceMembership, requireMinRole('admin'), removeMember);
router.post('/:workspaceId/invites', protect, loadWorkspaceMembership, requireMinRole('admin'), createInvite);
router.delete('/:workspaceId/invites/:inviteId', protect, loadWorkspaceMembership, requireMinRole('admin'), revokeInvite);

export default router;
