import express from 'express';
import {
  createOrganization,
  listMyWorkspaces,
  getWorkspace,
  upsertMember,
  removeMember,
} from '../controllers/workspaceController.js';
import { protect } from '../middleware/auth.js';
import { loadWorkspaceMembership, requireMinRole } from '../middleware/rbac.js';

const router = express.Router();

router.post('/organizations', protect, createOrganization);
router.get('/', protect, listMyWorkspaces);
router.get('/:workspaceId', protect, loadWorkspaceMembership, getWorkspace);
router.post('/:workspaceId/members', protect, loadWorkspaceMembership, requireMinRole('admin'), upsertMember);
router.delete('/:workspaceId/members/:userId', protect, loadWorkspaceMembership, requireMinRole('admin'), removeMember);

export default router;
