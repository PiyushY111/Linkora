import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import connectDB from './config/db.js';
import { scheduleAbuseRescan } from './services/threatDetectionService.js';
import { scheduleExpiryWebhookCheck } from './services/webhookService.js';
import { scheduleAuditRetention } from './services/auditRetentionService.js';
import { closeRedis } from './services/cacheService.js';
import { getAnalyticsRepository } from './repositories/analytics/analyticsRepository.js';
import { createClickConsumer, prepareClickConsumer } from './consumers/clickConsumer.js';

const SHUTDOWN_DRAIN_MS = 15000;

/**
 * Starts the API: connects to MongoDB, prepares the analytics collections,
 * schedules the cron jobs, and listens. With WORKER_MODE=embedded it also
 * runs the click consumer in this process, which is how a single free
 * instance can host the whole backend. Kept separate from app.js so
 * importing the app (e.g. in tests, via supertest) has none of these side
 * effects.
 *
 * @param {{ port?: number, workerMode?: 'separate' | 'embedded', mongoUri?: string }} [options]
 * @returns {Promise<{ server: import('http').Server, port: number, consumer: object | null, shutdown: () => Promise<void> }>}
 */
export async function startServer({ port = env.PORT, workerMode = env.WORKER_MODE, mongoUri = env.MONGODB_URI } = {}) {
  await connectDB(mongoUri, { exitOnFailure: false });
  await getAnalyticsRepository().ensureReady();

  const cronTasks = [scheduleAbuseRescan(), scheduleExpiryWebhookCheck(), scheduleAuditRetention()].filter(Boolean);

  let consumer = null;
  if (workerMode === 'embedded') {
    const prepared = await prepareClickConsumer();
    cronTasks.push(...prepared.cronTasks);
    consumer = createClickConsumer();
    consumer.start();
  }

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, () => resolve(s));
    s.once('error', reject);
  });
  const boundPort = server.address().port;
  logger.info({ port: boundPort, env: env.NODE_ENV, workerMode }, 'Server started');

  let shutdownPromise = null;

  /**
   * Graceful shutdown for both modes: stop accepting requests and let
   * in-flight ones finish (bounded by SHUTDOWN_DRAIN_MS), stop the cron jobs,
   * stop the embedded consumer (its in-flight batch completes and is ACKed),
   * then close MongoDB and Redis. Idempotent.
   */
  function shutdown() {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        const httpClosed = new Promise((resolve) => server.close(resolve));
        server.closeIdleConnections();
        const drainTimer = setTimeout(() => {
          logger.warn('Drain window expired; closing remaining connections');
          server.closeAllConnections();
        }, SHUTDOWN_DRAIN_MS);
        drainTimer.unref();

        cronTasks.forEach((task) => task.stop());
        await Promise.all([httpClosed, consumer?.stop()]);
        clearTimeout(drainTimer);

        // closeRedis() uses QUIT, which waits for in-flight commands
        // (including fire-and-forget XADDs) before closing.
        await Promise.allSettled([
          mongoose.connection.close().catch((err) => logger.error({ err }, 'Error closing MongoDB connection')),
          closeRedis().catch((err) => logger.error({ err }, 'Error closing Redis connection')),
        ]);
        logger.info('Shutdown complete');
      })();
    }
    return shutdownPromise;
  }

  return { server, port: boundPort, consumer, shutdown };
}

const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  startServer()
    .then(({ shutdown }) => {
      const onSignal = (signal) => {
        logger.info({ signal }, 'Shutdown signal received');
        shutdown().finally(() => process.exit(0));
      };
      process.on('SIGTERM', () => onSignal('SIGTERM'));
      process.on('SIGINT', () => onSignal('SIGINT'));
      process.on('unhandledRejection', (err) => {
        logger.error({ err }, 'Unhandled promise rejection');
        shutdown().finally(() => process.exit(1));
      });
    })
    .catch((err) => {
      logger.error({ err }, 'Server failed to start');
      process.exit(1);
    });
}
