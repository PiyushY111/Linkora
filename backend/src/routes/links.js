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
import { ssrfValidationMiddleware } from '../middleware/ssrfValidator.js';
import { linkCreationRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post(
  '/',
  protect,
  linkCreationRateLimiter,
  validateCreateLink,
  handleValidationErrors,
  ssrfValidationMiddleware,
  createLink
);
router.get('/', protect, getUserLinks);
router.get('/:id', protect, getLink);
router.put('/:id', protect, updateLink);
router.delete('/:id', protect, deleteLink);
router.patch('/:id/toggle', protect, toggleLinkStatus);

export default router;
