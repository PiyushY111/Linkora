import express from 'express';
import {
  createLink,
  getUserLinks,
  getLink,
  updateLink,
  deleteLink,
  toggleLinkStatus,
} from '../controllers/linkController.js';
import { protect } from '../middleware/auth.js';
import { requireActiveRole } from '../middleware/rbac.js';
import { validateCreateLink } from '../middleware/validation.js';
import { linkCreationRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// SSRF + threat-intel validation now happens once, centrally, inside
// createLinkRecord (services/linkUrlValidation.js) so create and update,
// dashboard and public API, all enforce the same checks — see
// linkController.js. A route-level-only check here would just duplicate it.
// Any workspace member can read links; changing them needs creator+.
router.post(
  '/',
  protect,
  requireActiveRole('creator'),
  linkCreationRateLimiter,
  validateCreateLink,
  createLink
);
router.get('/', protect, getUserLinks);
router.get('/:id', protect, getLink);
router.put('/:id', protect, requireActiveRole('creator'), updateLink);
router.delete('/:id', protect, requireActiveRole('creator'), deleteLink);
router.patch('/:id/toggle', protect, requireActiveRole('creator'), toggleLinkStatus);

export default router;
