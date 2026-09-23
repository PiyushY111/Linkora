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
import { validateCreateLink, handleValidationErrors } from '../middleware/validation.js';
import { linkCreationRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// SSRF + threat-intel validation now happens once, centrally, inside
// createLinkRecord (services/linkUrlValidation.js) so create and update,
// dashboard and public API, all enforce the same checks — see
// linkController.js. A route-level-only check here would just duplicate it.
router.post(
  '/',
  protect,
  linkCreationRateLimiter,
  validateCreateLink,
  handleValidationErrors,
  createLink
);
router.get('/', protect, getUserLinks);
router.get('/:id', protect, getLink);
router.put('/:id', protect, updateLink);
router.delete('/:id', protect, deleteLink);
router.patch('/:id/toggle', protect, toggleLinkStatus);

export default router;
