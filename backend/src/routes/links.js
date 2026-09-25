import express from 'express';
import {
  createLink,
  getUserLinks,
  getLink,
  updateLink,
  deleteLink,
  toggleLinkStatus,
  transferLink,
} from '../controllers/linkController.js';
import { protect } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateCreateLink } from '../middleware/validation.js';
import { linkCreationRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// SSRF + threat-intel validation now happens once, centrally, inside
// createLinkRecord (services/linkUrlValidation.js) so create and update,
// dashboard and public API, all enforce the same checks — see
// linkController.js. A route-level-only check here would just duplicate it.
// Roles per action are defined in utils/permissions.js.
const canRead = requirePermission('links:read');
const canWrite = requirePermission('links:write');

router.post(
  '/',
  protect,
  canWrite,
  linkCreationRateLimiter,
  validateCreateLink,
  createLink
);
router.get('/', protect, canRead, getUserLinks);
router.get('/:id', protect, canRead, getLink);
router.put('/:id', protect, canWrite, updateLink);
router.delete('/:id', protect, canWrite, deleteLink);
router.patch('/:id/toggle', protect, canWrite, toggleLinkStatus);
// Also needs 'links:write' in the destination workspace (checked in the controller).
router.patch('/:id/transfer', protect, canWrite, transferLink);

export default router;
