import express from 'express';
import { getLinkAnalytics, getAnalyticsSummary, exportAnalytics } from '../controllers/analyticsController.js';
import { protect } from '../middleware/auth.js';

/** Dashboard analytics routes, mounted at /api/analytics. */
const router = express.Router();

router.get('/export', protect, exportAnalytics);
router.get('/link/:linkId', protect, getLinkAnalytics);
router.get('/summary/all', protect, getAnalyticsSummary);

export default router;
