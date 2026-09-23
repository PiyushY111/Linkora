import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import connectDB from './config/db.js';
import { scheduleAbuseRescan } from './services/threatDetectionService.js';
import { scheduleExpiryWebhookCheck } from './services/webhookService.js';
import { getRedis } from './services/cacheService.js';
import { getAnalyticsRepository } from './repositories/analytics/analyticsRepository.js';

/**
 * The real process entrypoint (`node src/server.js`): connects to Mongo
 * and Redis, schedules the background cron jobs, and starts
 * listening. Kept separate from app.js so importing the app (e.g. in
 * tests, via supertest) never has any of these side effects.
 */
connectDB()
  .then(() => getAnalyticsRepository().ensureReady())
  .catch((err) => {
    logger.error({ err }, 'Failed to prepare analytics collections');
    process.exit(1);
  });
scheduleAbuseRescan();
scheduleExpiryWebhookCheck();

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

const closeConnections = async () => {
  // getRedis().quit() (unlike disconnect()) waits for in-flight commands —
  // including any XADD click events still in the pipeline — to complete
  // before closing the connection.
  await Promise.allSettled([
    mongoose.connection.close().catch((err) => logger.error({ err }, 'Error closing MongoDB connection')),
    getRedis().quit().catch((err) => logger.error({ err }, 'Error closing Redis connection')),
  ]);
};

const gracefulShutdown = async (signal) => {
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
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;
