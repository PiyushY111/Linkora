import express from 'express';
import { bulkCreateLinks } from '../controllers/publicApiController.js';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { createTokenBucketLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Burst up to 20 requests, sustained ~5 req/s per API key.
const publicApiLimiter = createTokenBucketLimiter({ capacity: 20, refillPerSecond: 5, keyPrefix: 'public-api' });

router.post('/v1/links/bulk', apiKeyAuth, publicApiLimiter, bulkCreateLinks);

export default router;
