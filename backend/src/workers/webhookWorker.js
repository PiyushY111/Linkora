import { pathToFileURL } from 'url';
import crypto from 'crypto';
import mongoose from 'mongoose';
import WebhookDelivery from '../models/WebhookDelivery.js';
import { performDelivery, DELIVERY_LEASE_MS } from '../services/webhookDelivery.js';
import connectDB from '../config/db.js';
import { closeRedis } from '../services/cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Drains the webhook delivery queue (models/WebhookDelivery.js). Runs
 * embedded in the API process (WORKER_MODE=embedded), inside the click
 * consumer process (WORKER_MODE=separate), or on its own
 * (`node src/workers/webhookWorker.js`). Any number of workers can run at
 * once: each claim is an atomic findOneAndUpdate that leases the row, and a
 * lease left behind by a crashed worker expires and is claimed again.
 */

const ERROR_BACKOFF_MS = 2000;

/**
 * Leases one due delivery to `workerId`, or returns null if none is due.
 * @param {string} workerId
 * @param {Date} [now]
 * @param {Record<string, unknown>} [scope] extra filter confining the claim
 *   (e.g. `{ workspace }`), so tests sharing a database don't drain each
 *   other's queues
 */
export async function claimDueDelivery(workerId, now = new Date(), scope = {}) {
  return WebhookDelivery.findOneAndUpdate(
    {
      ...scope,
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { status: 'in_flight', lockedUntil: { $lte: now } },
      ],
    },
    { $set: { status: 'in_flight', lockedBy: workerId, lockedUntil: new Date(now.getTime() + DELIVERY_LEASE_MS) } },
    { sort: { nextAttemptAt: 1 }, new: true }
  );
}

/**
 * @param {{ concurrency?: number, pollMs?: number, workerId?: string, scope?: Record<string, unknown> }} [options]
 */
export function createWebhookWorker({
  concurrency = env.WEBHOOK_WORKER_CONCURRENCY,
  pollMs = env.WEBHOOK_WORKER_POLL_MS,
  workerId = `webhook-worker-${process.pid}-${crypto.randomBytes(3).toString('hex')}`,
  scope = {},
} = {}) {
  let running = false;
  let loopDone = Promise.resolve();
  const inFlight = new Set();
  let wake = () => {};

  function sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  function track(delivery) {
    const task = performDelivery(delivery)
      .catch((err) => logger.error({ err, deliveryId: delivery._id }, 'Webhook delivery attempt crashed'))
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
  }

  async function loop() {
    while (running) {
      try {
        let claimed = 0;
        while (running && inFlight.size < concurrency) {
          const delivery = await claimDueDelivery(workerId, new Date(), scope);
          if (!delivery) break;
          track(delivery);
          claimed += 1;
        }
        if (claimed === 0 && running) await sleep(pollMs);
        else if (inFlight.size >= concurrency) await Promise.race(inFlight);
      } catch (err) {
        if (!running) break;
        logger.error({ err }, 'Webhook worker loop error');
        await sleep(ERROR_BACKOFF_MS);
      }
    }
  }

  return {
    workerId,

    start() {
      if (running) return;
      running = true;
      loopDone = loop();
      logger.info({ worker: workerId, concurrency }, 'Webhook worker started');
    },

    /** Stops claiming; resolves once every in-flight attempt has been recorded. */
    async stop() {
      running = false;
      wake();
      await loopDone;
      await Promise.allSettled([...inFlight]);
      logger.info({ worker: workerId }, 'Webhook worker stopped');
    },

    /** Processes everything currently due, then returns. For tests and scripts. */
    async drainOnce() {
      for (;;) {
        const delivery = await claimDueDelivery(workerId, new Date(), scope);
        if (!delivery) break;
        track(delivery);
        if (inFlight.size >= concurrency) await Promise.race(inFlight);
      }
      await Promise.allSettled([...inFlight]);
    },
  };
}

const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const run = async () => {
    await connectDB();
    const worker = createWebhookWorker();
    worker.start();

    let stopping = false;
    const shutdown = async (signal) => {
      if (stopping) return;
      stopping = true;
      logger.info({ signal }, 'Stopping webhook worker');
      await worker.stop();
      await Promise.allSettled([mongoose.connection.close(), closeRedis()]);
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  };

  run().catch((err) => {
    logger.error({ err }, 'Webhook worker crashed');
    process.exit(1);
  });
}
