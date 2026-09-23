import express from 'express';
import {
  redirectLink,
  unlockLink,
  getLinkAnalytics,
  getAnalyticsSummary,
  exportAnalytics,
} from '../controllers/analyticsController.js';
import { protect } from '../middleware/auth.js';
import { unlockRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Protected analytics routes (registered before /:shortCode wildcard)
router.get('/export', protect, exportAnalytics);
router.get('/link/:linkId', protect, getLinkAnalytics);
router.get('/summary/all', protect, getAnalyticsSummary);

// Public routes - no auth needed
router.post('/:shortCode/unlock', unlockRateLimiter, unlockLink);
// No Redis limiter here: it would cost a Redis command on every redirect
// (docs/redis-keys.md, "Command budget"), and the in-memory limiter in
// app.js already applies to this route with a far lower ceiling.
router.get('/:shortCode', redirectLink);

export default router;

