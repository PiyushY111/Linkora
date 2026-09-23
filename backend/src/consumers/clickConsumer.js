import crypto from 'crypto';
import { UAParser } from 'ua-parser-js';
import mongoose from 'mongoose';
import { getRedis, closeRedis } from '../services/cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { lookupGeo, scheduleGeoIpUpdates } from '../services/geoipService.js';
import { getAnalyticsRepository } from '../repositories/analytics/analyticsRepository.js';
import connectDB from '../config/db.js';
import { dispatchEvent } from '../services/webhookService.js';

/**
 * Redis Streams consumer-group worker for click events. Runs as its own
 * process (`node src/consumers/clickConsumer.js`) or embedded in the API
 * process (WORKER_MODE=embedded, see server.js). Several instances share
 * load through the consumer group (XREADGROUP/XACK) and recover each
 * other's crashed batches (XAUTOCLAIM).
 *
 * Built to spend as few Redis commands as possible while idle, since a
 * free-tier Redis has a monthly command budget (docs/redis-keys.md,
 * "Command budget"): the blocking read backs off to a long BLOCK when the
 * stream is quiet, and stale-entry recovery runs on a slow timer rather
 * than every loop.
 */

// Reclaim entries another consumer left pending for longer than this.
const CLAIM_IDLE_MS = 30000;
const ERROR_BACKOFF_MS = 1000;

function streamEntryToObject(fieldArray) {
  const obj = {};
  for (let i = 0; i < fieldArray.length; i += 2) {
    obj[fieldArray[i]] = fieldArray[i + 1];
  }
  return obj;
}

export async function ensureConsumerGroup() {
  try {
    await getRedis().xgroup('CREATE', env.CLICK_STREAM_KEY, env.CLICK_STREAM_CONSUMER_GROUP, '$', 'MKSTREAM');
  } catch (err) {
    if (!String(err.message).includes('BUSYGROUP')) throw err;
  }
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip || '').digest('hex');
}

function parseUserAgent(ua) {
  const result = new UAParser(ua || '').getResult();
  return {
    deviceType: result.device.type || 'desktop',
    browserFamily: result.browser.name || 'Unknown',
    osFamily: result.os.name || 'Unknown',
  };
}

function extractDomain(referer) {
  if (!referer || referer === 'direct') return '';
  try {
    return new URL(referer).hostname;
  } catch {
    return '';
  }
}

/**
 * Turns one raw stream entry into a ClickEventRecord: GeoIP (MaxMind) and
 * user-agent parsing happen here, never on the redirect hot path. The
 * stream entry ID becomes the event ID, which is what makes every
 * downstream write idempotent under redelivery.
 * @returns {Promise<import('../repositories/analytics/analyticsRepository.js').ClickEventRecord>}
 */
async function enrichEvent(id, fields) {
  const [geo, ua] = [await lookupGeo(fields.ip), parseUserAgent(fields.ua)];
  return {
    eventId: id,
    linkId: fields.linkId,
    userId: fields.userId || '',
    shortCode: fields.shortCode,
    timestamp: new Date(Number(fields.timestamp) || Date.now()),
    ipHash: hashIp(fields.ip),
    referrerDomain: extractDomain(fields.referer),
    device: ua.deviceType,
    browser: ua.browserFamily,
    os: ua.osFamily,
    country: geo.countryCode,
    city: geo.city,
    utmSource: fields.utmSource || '',
    utmMedium: fields.utmMedium || '',
    utmCampaign: fields.utmCampaign || '',
    variantId: fields.variantId || null,
    variantName: fields.variantName || null,
    isBot: fields.isBot === 'true' || fields.isBot === true,
    botName: fields.botName || null,
  };
}

/**
 * Enriches a batch, records it through the analytics repository, and only
 * then XACKs. Entries that fail enrichment are
 * left un-acked so XAUTOCLAIM retries them; a failed write throws, leaving
 * the whole batch pending, which is safe because every write is idempotent.
 */
export async function processBatch(entries, { redis = getRedis() } = {}) {
  const events = [];
  const ackIds = [];

  for (const [id, fieldArray] of entries) {
    try {
      events.push(await enrichEvent(id, streamEntryToObject(fieldArray)));
      ackIds.push(id);
    } catch (err) {
      logger.error({ err, id }, 'Failed to enrich click event; leaving unacked for XAUTOCLAIM retry');
    }
  }

  // Raw event, rollups, unique visitors and Link.clicks, all idempotent.
  const { applied } = await getAnalyticsRepository().recordClicks(events);
  if (ackIds.length > 0) {
    await redis.xack(env.CLICK_STREAM_KEY, env.CLICK_STREAM_CONSUMER_GROUP, ...ackIds);
  }

  // Fire-and-forget: click webhook subscribers, only for newly applied events.
  for (const e of applied) {
    if (!e.userId) continue;
    const data = {
      linkId: e.linkId,
      shortCode: e.shortCode,
      country: e.country,
      device: e.device,
      browser: e.browser,
      referrerDomain: e.referrerDomain,
      timestamp: e.timestamp.toISOString(),
    };
    dispatchEvent(e.userId, 'click', data).catch((err) => logger.error({ err }, 'Failed to dispatch click webhook'));
  }

  if (entries.length > 0) {
    logger.info({ count: entries.length, acked: ackIds.length }, 'Processed click event batch');
  }
}

/**
 * Reclaims and reprocesses entries another consumer left pending for longer
 * than CLAIM_IDLE_MS (a crash, or a batch whose write failed).
 */
async function claimStalePending(redis, consumerName) {
  // Redis 7+ also returns the IDs of pending entries that MAXLEN trimming
  // deleted before anyone processed them; those clicks are gone, and
  // leaving them pending would grow the PEL forever.
  const [, entries, deletedIds = []] = await redis.xautoclaim(
    env.CLICK_STREAM_KEY,
    env.CLICK_STREAM_CONSUMER_GROUP,
    consumerName,
    CLAIM_IDLE_MS,
    '0-0',
    'COUNT',
    env.CLICK_STREAM_BATCH_SIZE
  );
  if (deletedIds.length > 0) {
    logger.error({ count: deletedIds.length }, 'Pending click events were trimmed from the stream before processing; lost');
    await redis.xack(env.CLICK_STREAM_KEY, env.CLICK_STREAM_CONSUMER_GROUP, ...deletedIds);
  }
  if (entries.length > 0) {
    logger.warn({ count: entries.length }, 'Reclaimed stale pending click events');
    await processBatch(entries, { redis });
  }
}

/**
 * @param {{
 *   redis?: import('ioredis').Redis,
 *   blockingRedis?: import('ioredis').Redis,
 *   consumerName?: string,
 *   blockMinMs?: number,
 *   blockMaxMs?: number,
 *   claimIntervalMs?: number,
 * }} [options]
 *   `blockingRedis` serves only the blocking XREADGROUP. It must be its own
 *   connection: a BLOCK of up to blockMaxMs holds the connection, and in
 *   embedded mode every API command queued behind it would wait too.
 */
export function createClickConsumer({
  redis = getRedis(),
  blockingRedis = redis.duplicate(),
  consumerName = `consumer-${process.pid}-${crypto.randomBytes(3).toString('hex')}`,
  blockMinMs = env.CLICK_CONSUMER_BLOCK_MIN_MS,
  blockMaxMs = env.CLICK_CONSUMER_BLOCK_MAX_MS,
  claimIntervalMs = env.CLICK_CONSUMER_CLAIM_INTERVAL_MS,
} = {}) {
  let running = false;
  let reading = false;
  let loopDone = Promise.resolve();

  async function readOnce(blockMs) {
    reading = true;
    try {
      return await blockingRedis.xreadgroup(
        'GROUP',
        env.CLICK_STREAM_CONSUMER_GROUP,
        consumerName,
        'COUNT',
        env.CLICK_STREAM_BATCH_SIZE,
        'BLOCK',
        blockMs,
        'STREAMS',
        env.CLICK_STREAM_KEY,
        '>'
      );
    } finally {
      reading = false;
    }
  }

  async function loop() {
    let blockMs = blockMinMs;
    let lastClaimAt = -Infinity;
    while (running) {
      try {
        if (Date.now() - lastClaimAt >= claimIntervalMs) {
          lastClaimAt = Date.now();
          await claimStalePending(redis, consumerName);
        }

        const response = await readOnce(blockMs);
        const entries = response?.[0]?.[1] || [];
        if (entries.length > 0) {
          await processBatch(entries, { redis });
          blockMs = blockMinMs;
        } else {
          // Idle: each empty read doubles the next BLOCK, up to blockMaxMs.
          // A new entry still returns a blocked read immediately, so this
          // costs no latency, only fewer commands while nothing happens.
          blockMs = Math.min(blockMs * 2, blockMaxMs);
        }
      } catch (err) {
        if (!running) break; // stop() aborted the blocking read
        logger.error({ err }, 'Click consumer loop error');
        await new Promise((resolve) => setTimeout(resolve, ERROR_BACKOFF_MS));
      }
    }
  }

  return {
    consumerName,

    /** Starts polling; resolves once the loop has started. */
    start() {
      if (running) return;
      running = true;
      loopDone = loop();
      logger.info({ consumer: consumerName, group: env.CLICK_STREAM_CONSUMER_GROUP }, 'Click consumer started');
    },

    /**
     * Stops polling. An in-flight batch finishes (and is ACKed) first; a
     * blocking read with nothing to process is aborted by closing its
     * dedicated connection. Resolves once the loop has exited.
     */
    async stop() {
      running = false;
      if (reading) blockingRedis.disconnect();
      await loopDone;
      if (blockingRedis.status !== 'end') blockingRedis.disconnect();
      logger.info({ consumer: consumerName }, 'Click consumer stopped');
    },
  };
}

/**
 * Everything a consumer needs before it can poll, shared by the standalone
 * worker and embedded mode.
 */
export async function prepareClickConsumer() {
  await getAnalyticsRepository().ensureReady();
  await ensureConsumerGroup();
  scheduleGeoIpUpdates();
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const run = async () => {
    await connectDB();
    await prepareClickConsumer();
    const consumer = createClickConsumer();
    consumer.start();

    let stopping = false;
    const shutdown = async (signal) => {
      if (stopping) return;
      stopping = true;
      logger.info({ signal }, 'Stopping click consumer');
      await consumer.stop();
      await Promise.allSettled([mongoose.connection.close(), closeRedis()]);
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  };

  run().catch((err) => {
    logger.error({ err }, 'Click consumer crashed');
    process.exit(1);
  });
}
