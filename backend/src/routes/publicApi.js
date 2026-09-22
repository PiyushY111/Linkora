import express from 'express';
import {
  listLinks,
  createLink,
  getLink,
  updateLink,
  deleteLink,
  getLinkAnalytics,
  bulkCreateLinks,
  getUsage,
  getOpenApiSpec,
} from '../controllers/publicApiController.js';
import { apiKeyAuth, requireScope } from '../middleware/apiKeyAuth.js';
import { apiTelemetry } from '../middleware/apiTelemetry.js';
import { createTokenBucketLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public OpenAPI specification endpoint (no key required for docs)
router.get('/v1/openapi.json', getOpenApiSpec);

// Token-bucket limiter: Burst up to 30 requests, sustained ~10 req/s per API key
const publicApiLimiter = createTokenBucketLimiter({
  capacity: 30,
  refillPerSecond: 10,
  keyPrefix: 'public-api',
});

// Authenticated Public API V1 router
const v1 = express.Router();
v1.use(apiKeyAuth);
v1.use(apiTelemetry);
v1.use(publicApiLimiter);

// Links Management
v1.get('/links', requireScope('links:read'), listLinks);
v1.post('/links', requireScope('links:write'), createLink);
v1.get('/links/:code', requireScope('links:read'), getLink);
v1.patch('/links/:code', requireScope('links:write'), updateLink);
v1.delete('/links/:code', requireScope('links:delete'), deleteLink);

// Link Analytics
v1.get('/links/:code/analytics', requireScope('analytics:read'), getLinkAnalytics);

// Bulk Provisioning
v1.post('/links/bulk', requireScope('links:write'), bulkCreateLinks);

// Usage & Telemetry
v1.get('/usage', getUsage);

router.use('/v1', v1);

export default router;
