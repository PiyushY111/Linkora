import express from 'express';
import {
  getBioPage,
  createBioPage,
  updateBioPage,
  addBioPageItem,
  reorderBioPageItems,
  updateBioPageItem,
  removeBioPageItem,
  checkSlugAvailability,
  getPublicBioPage,
} from '../controllers/bioPageController.js';
import { protect } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBioPageItem } from '../middleware/validation.js';
import { linkCreationRateLimiter, bioSlugCheckRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// The bio page belongs to the active workspace and is made of its links,
// so it uses the links permissions (utils/permissions.js).
const canRead = requirePermission('links:read');
const canWrite = requirePermission('links:write');

// An item added from a raw destinationUrl creates a link, so it counts
// against the same quota as POST /api/links.
const limitLinkCreation = (req, res, next) =>
  req.body?.destinationUrl ? linkCreationRateLimiter(req, res, next) : next();

// Public: the builder checks slugs while the user types.
router.get('/slug-availability', bioSlugCheckRateLimiter, checkSlugAvailability);
// Public: what the /b/:slug page renders. Public-safe fields only.
router.get('/public/:slug', getPublicBioPage);

router.get('/', protect, canRead, getBioPage);
router.post('/', protect, canWrite, createBioPage);
router.patch('/', protect, canWrite, updateBioPage);
router.post('/items', protect, canWrite, limitLinkCreation, validateBioPageItem, addBioPageItem);
router.put('/items/order', protect, canWrite, reorderBioPageItems);
router.patch('/items/:itemId', protect, canWrite, updateBioPageItem);
router.delete('/items/:itemId', protect, canWrite, removeBioPageItem);

export default router;
