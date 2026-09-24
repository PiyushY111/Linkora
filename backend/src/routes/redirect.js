import express from 'express';
import { redirectLink, unlockLink } from '../controllers/analyticsController.js';
import { unlockRateLimiter } from '../middleware/rateLimiter.js';

/** Public short-link routes, mounted at /api/r. */
const router = express.Router();

router.post('/:shortCode/unlock', unlockRateLimiter, unlockLink);
// No Redis limiter here: it would cost a Redis command on every redirect
// (docs/redis-keys.md, "Command budget"), and the in-memory limiter in
// app.js already applies to this route with a far lower ceiling.
router.get('/:shortCode', redirectLink);

export default router;
