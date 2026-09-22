import express from 'express';
import { redirectLink, getLinkAnalytics, getAnalyticsSummary } from '../controllers/analyticsController.js';
import { protect } from '../middleware/auth.js';
import { redirectRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public route - no auth needed
router.get('/:shortCode', redirectRateLimiter, redirectLink);

// Protected routes
router.get('/link/:linkId', protect, getLinkAnalytics);
router.get('/summary/all', protect, getAnalyticsSummary);

export default router;
