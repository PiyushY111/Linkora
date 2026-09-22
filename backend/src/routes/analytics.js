import express from 'express';
import {
  redirectLink,
  getLinkAnalytics,
  getAnalyticsSummary,
  exportAnalytics,
} from '../controllers/analyticsController.js';
import { protect } from '../middleware/auth.js';
import { redirectRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Protected analytics routes (registered before /:shortCode wildcard)
router.get('/export', protect, exportAnalytics);
router.get('/link/:linkId', protect, getLinkAnalytics);
router.get('/summary/all', protect, getAnalyticsSummary);

// Public route - no auth needed
router.get('/:shortCode', redirectRateLimiter, redirectLink);

export default router;

