import 'express-async-errors';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { httpLogger } from './config/logger.js';
import { errorHandler, notFound } from './middleware/error.js';
import { metricsMiddleware, metricsAuth, metricsHandler } from './middleware/metrics.js';
import { getRedis } from './services/cacheService.js';
import { isAllowedOrigin } from './config/allowedOrigins.js';

import { getClientIp } from './utils/helpers.js';

// Import routes
import authRoutes from './routes/auth.js';
import linkRoutes from './routes/links.js';
import analyticsRoutes from './routes/analytics.js';
import workspaceRoutes from './routes/workspaces.js';
import webhookRoutes from './routes/webhooks.js';
import publicApiRoutes from './routes/publicApi.js';
import developerRoutes from './routes/developer.js';

/**
 * Builds and returns the Express app. Importing this file has no side
 * effects — it does not connect to Mongo or Redis, does not listen
 * on a port, and does not schedule any cron jobs. That's server.js's job.
 * Tests import this directly (with supertest) against whatever
 * Mongo/Redis the test's own setup has already pointed cacheService.js /
 * config/db.js at.
 */
const app = express();

app.set('trust proxy', env.TRUST_PROXY_HOPS);

// Structured logging with request-ID propagation (must run before routes)
app.use(httpLogger);

// Middleware
app.use(helmet());
// Credentialed CORS only for explicitly allowed origins (FRONTEND_URL,
// ALLOWED_ORIGINS, and localhost outside production). Requests with no
// Origin (same-origin, curl, server-to-server) aren't CORS requests at all.
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
  credentials: true,
}));
app.use(cookieParser());

app.use(metricsMiddleware);

// Local rate limiting fallback; replaced on the redirect/auth/link-creation
// paths by the Redis-backed sliding-window limiter.
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW * 60 * 1000,
  max: env.NODE_ENV === 'development' ? 5000 : env.RATE_LIMIT_MAX_REQUESTS,
  message: { success: false, message: 'Too many requests, please try again later' },
  keyGenerator: (req) => getClientIp(req),
  skip: (req) => req.path.startsWith('/health') || req.path === '/metrics',
});

app.use(limiter);

// Body size limits. Most routes take small JSON, so the default is 100 KB.
// Two routes need more, and their parsers must be registered first:
// body-parser skips re-parsing once `req._body` is set, so the first
// matching parser wins.
// - Bulk link creation takes up to 1,000 URLs per request.
// - Dashboard link create/update can carry a QR logo as a data URL in
//   qrConfig (the UI allows a 2 MB image, about 2.7 MB as base64).
const DEFAULT_BODY_LIMIT = '100kb';
app.use('/api/public/v1/links/bulk', express.json({ limit: '2mb' }));
const qrLogoBody = express.json({ limit: '3mb' });
app.post('/api/links', qrLogoBody);
app.put('/api/links/:id', qrLogoBody);

app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
app.use(express.urlencoded({ limit: DEFAULT_BODY_LIMIT, extended: true }));

// Health check (kept for backward compatibility)
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is running' });
});

// Liveness: process is responsive. No dependency checks (and no Redis
// commands), so it's safe for a platform to poll often: a slow or broken
// dependency should surface as a readiness failure, not a restart loop.
app.get('/health/liveness', (req, res) => {
  res.status(200).json({ success: true, status: 'alive' });
});

// Readiness: safe to receive traffic. Checks Redis connectivity, MongoDB
// round-trip latency (<50ms), and that the click-stream consumer group is
// reachable (informational — the group is created lazily by the consumer
// process, so its absence doesn't fail readiness).
//
// Costs two Redis commands per call. Point platform health checks at
// /health/liveness instead; poll this rarely (docs/redis-keys.md,
// "Command budget"). Failure details go to the log, never the response.
app.get('/health/readiness', async (req, res) => {
  const checks = {};
  let healthy = true;

  try {
    const start = Date.now();
    await getRedis().ping();
    checks.redis = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    req.log.warn({ err }, 'Readiness: Redis check failed');
    checks.redis = { ok: false };
    healthy = false;
  }

  try {
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    const latencyMs = Date.now() - start;
    checks.mongodb = { ok: latencyMs < 50, latencyMs };
    if (latencyMs >= 50) healthy = false;
  } catch (err) {
    req.log.warn({ err }, 'Readiness: MongoDB check failed');
    checks.mongodb = { ok: false };
    healthy = false;
  }

  try {
    await getRedis().xinfo('GROUPS', env.CLICK_STREAM_KEY);
    checks.streamConsumerGroup = { ok: true };
  } catch {
    checks.streamConsumerGroup = { ok: false, note: 'group not yet created by consumer' };
  }

  res.status(healthy ? 200 : 503).json({ success: healthy, checks });
});

// Metrics (protected)
app.get('/metrics', metricsAuth, metricsHandler);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/r', analyticsRoutes); // Redirect route & analytics
app.use('/api/analytics', analyticsRoutes); // Analytics API
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/public', publicApiRoutes);
app.use('/api/developer', developerRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;
