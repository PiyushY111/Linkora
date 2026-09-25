import express from 'express';
import {
  redirectLink,
  unlockLink,
  getLinkAnalytics,
  getAnalyticsSummary,
  exportAnalytics,
} from '../controllers/analyticsController.js';
import { protect } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { unlockRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Protected analytics routes (registered before /:shortCode wildcard)
// Any member reads aggregates; per-click detail inside these responses is
// trimmed in the controller ('analytics:detail'); raw CSV is creator+.
router.get('/export', protect, requirePermission('analytics:export'), exportAnalytics);
router.get('/link/:linkId', protect, requirePermission('analytics:read'), getLinkAnalytics);
router.get('/summary/all', protect, requirePermission('analytics:read'), getAnalyticsSummary);

// Public routes - no auth needed
router.post('/:shortCode/unlock', unlockRateLimiter, unlockLink);
// No Redis limiter here: it would cost a Redis command on every redirect
// (docs/redis-keys.md, "Command budget"), and the in-memory limiter in
// app.js already applies to this route with a far lower ceiling.
router.get('/:shortCode', redirectLink);

export default router;

