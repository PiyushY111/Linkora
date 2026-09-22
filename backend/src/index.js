import 'express-async-errors';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger, httpLogger } from './config/logger.js';
import connectDB from './config/db.js';
import { errorHandler, notFound } from './middleware/error.js';
import { metricsMiddleware, metricsAuth, metricsHandler } from './middleware/metrics.js';
import { ensureClickHouseSchema } from './config/clickhouse.js';
import { scheduleAbuseRescan } from './services/threatDetectionService.js';
import { scheduleExpiryWebhookCheck } from './services/webhookService.js';
import { redis } from './services/cacheService.js';

// Import routes
import authRoutes from './routes/auth.js';
import linkRoutes from './routes/links.js';
import analyticsRoutes from './routes/analytics.js';
import workspaceRoutes from './routes/workspaces.js';
import webhookRoutes from './routes/webhooks.js';
import publicApiRoutes from './routes/publicApi.js';

// Connect to database
connectDB();
ensureClickHouseSchema().catch((err) => logger.error({ err }, 'Failed to ensure ClickHouse schema'));
scheduleAbuseRescan();
scheduleExpiryWebhookCheck();

const app = express();

app.set('trust proxy', env.TRUST_PROXY_HOPS);

// Structured logging with request-ID propagation (must run before routes)
app.use(httpLogger);

// Middleware
app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

app.use(metricsMiddleware);

// Local rate limiting fallback; replaced on the redirect/auth/link-creation
// paths by the Redis-backed sliding-window limiter in Phase 5.
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW * 60 * 1000,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests, please try again later',
});

app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health check (kept for backward compatibility)
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is running' });
});

// Liveness: process is responsive. No dependency checks — a slow/broken
// dependency should surface as a readiness failure, not a restart loop.
app.get('/health/liveness', (req, res) => {
  res.status(200).json({ success: true, status: 'alive' });
});

// Readiness: safe to receive traffic. Checks Redis connectivity, MongoDB
// round-trip latency (<50ms), and that the click-stream consumer group is
// reachable (informational — the group is created lazily by the consumer
// process, so its absence doesn't fail readiness).
app.get('/health/readiness', async (req, res) => {
  const checks = {};
  let healthy = true;

  try {
    const start = Date.now();
    await redis.ping();
    checks.redis = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    checks.redis = { ok: false, error: err.message };
    healthy = false;
  }

  try {
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    const latencyMs = Date.now() - start;
    checks.mongodb = { ok: latencyMs < 50, latencyMs };
    if (latencyMs >= 50) healthy = false;
  } catch (err) {
    checks.mongodb = { ok: false, error: err.message };
    healthy = false;
  }

  try {
    await redis.xinfo('GROUPS', env.CLICK_STREAM_KEY);
    checks.streamConsumerGroup = { ok: true };
  } catch (err) {
    checks.streamConsumerGroup = { ok: false, note: 'group not yet created by consumer', error: err.message };
  }

  res.status(healthy ? 200 : 503).json({ success: healthy, checks });
});

// Metrics (protected)
app.get('/metrics', metricsAuth, metricsHandler);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/r', analyticsRoutes); // Redirect route
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/public', publicApiRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
  server.close(() => process.exit(1));
});

const SHUTDOWN_DRAIN_MS = 15000;
let shuttingDown = false;

async function closeConnections() {
  // redis.quit() (unlike disconnect()) waits for in-flight commands —
  // including any XADD click events still in the pipeline — to complete
  // before closing the connection.
  await Promise.allSettled([
    mongoose.connection.close().catch((err) => logger.error({ err }, 'Error closing MongoDB connection')),
    redis.quit().catch((err) => logger.error({ err }, 'Error closing Redis connection')),
  ]);
}

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutdown signal received; draining in-flight requests');

  const drainTimer = setTimeout(() => {
    logger.warn('Drain window expired; forcing shutdown');
    closeConnections().finally(() => process.exit(0));
  }, SHUTDOWN_DRAIN_MS);
  drainTimer.unref();

  server.close(async () => {
    logger.info('HTTP server closed; no longer accepting new connections');
    clearTimeout(drainTimer);
    await closeConnections();
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
