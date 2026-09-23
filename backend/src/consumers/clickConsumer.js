import crypto from 'crypto';
import { UAParser } from 'ua-parser-js';
import { redis } from '../services/cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { lookupGeo, scheduleGeoIpUpdates } from '../services/geoipService.js';
import { getAnalyticsRepository } from '../repositories/analytics/analyticsRepository.js';
import connectDB from '../config/db.js';
import { dispatchEvent } from '../services/webhookService.js';

/**
 * Dedicated Redis Streams consumer group worker. Runs as its own process
 * (`node src/consumers/clickConsumer.js`), separate from the redirect
 * request path, so multiple instances can share load via consumer-group
 * semantics (XREADGROUP/XACK) and crash recovery (XAUTOCLAIM).
 */

const CONSUMER_NAME = `consumer-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
const CLAIM_IDLE_MS = 30000; // reclaim entries a crashed consumer left pending > 30s

let running = true;

function streamEntryToObject(fieldArray) {
  const obj = {};
  for (let i = 0; i < fieldArray.length; i += 2) {
    obj[fieldArray[i]] = fieldArray[i + 1];
  }
  return obj;
}

export async function ensureConsumerGroup() {
  try {
    await redis.xgroup('CREATE', env.CLICK_STREAM_KEY, env.CLICK_STREAM_CONSUMER_GROUP, '$', 'MKSTREAM');
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
export async function processBatch(entries) {
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
 * Reclaims and reprocesses entries left pending by a crashed/restarted
 * consumer (idle longer than CLAIM_IDLE_MS).
 */
export async function claimStalePending() {
  try {
    const [, entries] = await redis.xautoclaim(
      env.CLICK_STREAM_KEY,
      env.CLICK_STREAM_CONSUMER_GROUP,
      CONSUMER_NAME,
      CLAIM_IDLE_MS,
      '0-0',
      'COUNT',
      env.CLICK_STREAM_BATCH_SIZE
    );
    if (entries.length > 0) {
      logger.warn({ count: entries.length }, 'Reclaimed stale pending click events');
      await processBatch(entries);
    }
  } catch (err) {
    logger.error({ err }, 'Failed to claim stale pending entries');
  }
}

async function pollLoop() {
  while (running) {
    try {
      const response = await redis.xreadgroup(
        'GROUP',
        env.CLICK_STREAM_CONSUMER_GROUP,
        CONSUMER_NAME,
        'COUNT',
        env.CLICK_STREAM_BATCH_SIZE,
        'BLOCK',
        env.CLICK_STREAM_BATCH_INTERVAL_MS,
        'STREAMS',
        env.CLICK_STREAM_KEY,
        '>'
      );

      if (response) {
        const [, entries] = response[0];
        if (entries.length > 0) await processBatch(entries);
      }

      await claimStalePending();
    } catch (err) {
      logger.error({ err }, 'Click consumer poll loop error');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export async function startClickConsumer() {
  await connectDB();
  await getAnalyticsRepository().ensureReady();
  await ensureConsumerGroup();
  scheduleGeoIpUpdates();

  logger.info({ consumer: CONSUMER_NAME, group: env.CLICK_STREAM_CONSUMER_GROUP }, 'Click consumer started');
  await pollLoop();
}

export function stopClickConsumer() {
  running = false;
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  process.on('SIGTERM', stopClickConsumer);
  process.on('SIGINT', stopClickConsumer);

  startClickConsumer().catch((err) => {
    logger.error({ err }, 'Click consumer crashed');
    process.exit(1);
  });
}
