import express from 'express';
import {
  redirectLink,
  unlockLink,
  getLinkAnalytics,
  getAnalyticsSummary,
  exportAnalytics,
} from '../controllers/analyticsController.js';
import { protect } from '../middleware/auth.js';
import { redirectRateLimiter, unlockRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Protected analytics routes (registered before /:shortCode wildcard)
router.get('/export', protect, exportAnalytics);
router.get('/link/:linkId', protect, getLinkAnalytics);
router.get('/summary/all', protect, getAnalyticsSummary);

// Public routes - no auth needed
router.post('/:shortCode/unlock', unlockRateLimiter, unlockLink);
router.get('/:shortCode', redirectRateLimiter, redirectLink);

export default router;

