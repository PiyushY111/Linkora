import crypto from 'crypto';
import mongoose from 'mongoose';
import { UAParser } from 'ua-parser-js';
import { redis, linkCountersKey } from '../services/cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { lookupGeo, scheduleGeoIpUpdates } from '../services/geoipService.js';
import { bulkInsert, ensureClickHouseSchema } from '../config/clickhouse.js';
import ClickEvent from '../models/ClickEvent.js';
import Link from '../models/Link.js';
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
const RECONCILE_INTERVAL_MS = 30000;

let running = true;

function streamEntryToObject(fieldArray) {
  const obj = {};
  for (let i = 0; i < fieldArray.length; i += 2) {
    obj[fieldArray[i]] = fieldArray[i + 1];
  }
  return obj;
}

async function ensureConsumerGroup() {
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
 * Enriches a raw click event with GeoIP (MaxMind) and parsed user-agent
 * data. This is the only place geo resolution happens — never on the
 * redirect hot path.
 */
async function enrichEvent(fields) {
  const [geo, ua] = [await lookupGeo(fields.ip), parseUserAgent(fields.ua)];
  const ipHash = hashIp(fields.ip);

  return {
    clickhouseRow: {
      event_id: crypto.randomUUID(),
      link_id: fields.linkId,
      short_code: fields.shortCode,
      user_id: fields.userId || '',
      timestamp: new Date(Number(fields.timestamp) || Date.now()).toISOString(),
      ip_hash: ipHash,
      country_code: geo.countryCode,
      city: geo.city,
      latitude: geo.latitude,
      longitude: geo.longitude,
      device_type: ua.deviceType,
      browser_family: ua.browserFamily,
      os_family: ua.osFamily,
      referrer_domain: extractDomain(fields.referer),
      utm_source: fields.utmSource || '',
      utm_medium: fields.utmMedium || '',
      utm_campaign: fields.utmCampaign || '',
      variant_id: fields.variantId || '',
      is_bot: fields.isBot === 'true' || fields.isBot === true ? 1 : 0,
      bot_name: fields.botName || '',
    },
    mongoDoc: {
      link: fields.linkId,
      user: fields.userId,
      shortCode: fields.shortCode,
      timestamp: new Date(Number(fields.timestamp) || Date.now()),
      ipHash,
      userAgent: fields.ua,
      referer: fields.referer,
      device: ua.deviceType,
      browser: ua.browserFamily,
      os: ua.osFamily,
      country: geo.countryCode,
      city: geo.city,
      utmSource: fields.utmSource,
      utmMedium: fields.utmMedium,
      utmCampaign: fields.utmCampaign,
      variantId: fields.variantId || null,
      variantName: fields.variantName || null,
      isBot: fields.isBot === 'true' || fields.isBot === true,
      botName: fields.botName || null,
    },
  };
}

/**
 * Enriches, bulk-inserts into ClickHouse, mirrors into the bounded
 * ClickEvent collection, and XACKs each successfully processed entry.
 * Entries that fail enrichment are left un-acked so XAUTOCLAIM retries them.
 */
async function processBatch(entries) {
  const clickhouseRows = [];
  const mongoDocs = [];
  const ackIds = [];
  const webhookDispatches = [];

  for (const [id, fieldArray] of entries) {
    const fields = streamEntryToObject(fieldArray);
    try {
      const { clickhouseRow, mongoDoc } = await enrichEvent(fields);
      clickhouseRows.push(clickhouseRow);
      mongoDocs.push(mongoDoc);
      ackIds.push(id);
      if (fields.userId) {
        webhookDispatches.push({
          userId: fields.userId,
          data: {
            linkId: fields.linkId,
            shortCode: fields.shortCode,
            country: clickhouseRow.country_code,
            device: clickhouseRow.device_type,
            browser: clickhouseRow.browser_family,
            referrerDomain: clickhouseRow.referrer_domain,
            timestamp: clickhouseRow.timestamp,
          },
        });
      }
    } catch (err) {
      logger.error({ err, id }, 'Failed to enrich click event; leaving unacked for XAUTOCLAIM retry');
    }
  }

  if (clickhouseRows.length > 0) {
    await bulkInsert('click_events', clickhouseRows);
  }
  if (mongoDocs.length > 0) {
    await ClickEvent.insertMany(mongoDocs, { ordered: false }).catch((err) =>
      logger.error({ err }, 'Failed to bulk insert ClickEvent rows')
    );
  }
  if (ackIds.length > 0) {
    await redis.xack(env.CLICK_STREAM_KEY, env.CLICK_STREAM_CONSUMER_GROUP, ...ackIds);
  }

  // Fire-and-forget: click webhook subscribers, dispatched per event.
  for (const { userId, data } of webhookDispatches) {
    dispatchEvent(userId, 'click', data).catch((err) => logger.error({ err }, 'Failed to dispatch click webhook'));
  }

  if (entries.length > 0) {
    logger.info({ count: entries.length, acked: ackIds.length }, 'Processed click event batch');
  }
}

/**
 * Reclaims and reprocesses entries left pending by a crashed/restarted
 * consumer (idle longer than CLAIM_IDLE_MS).
 */
async function claimStalePending() {
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

/**
 * Periodically flushes the Redis per-day click counters (written
 * synchronously on the redirect hot path via HINCRBY) into MongoDB via a
 * batched $inc, using an atomic RENAME to claim the current bucket so
 * concurrent consumer instances never double-count.
 */
async function reconcileClickCounters() {
  const date = new Date().toISOString().slice(0, 10);
  const key = linkCountersKey(date);
  const swapKey = `${key}:reconciling:${Date.now()}`;

  try {
    await redis.rename(key, swapKey);
  } catch (err) {
    if (!String(err.message).includes('no such key')) {
      logger.error({ err }, 'Failed to claim click counters for reconciliation');
    }
    return;
  }

  const counters = await redis.hgetall(swapKey);
  await redis.del(swapKey);

  const bulkOps = Object.entries(counters)
    .filter(([linkId]) => mongoose.isValidObjectId(linkId))
    .map(([linkId, count]) => ({
      updateOne: {
        filter: { _id: linkId },
        update: { $inc: { clicks: Number(count) || 0 }, $set: { lastAccessedAt: new Date() } },
      },
    }));

  if (bulkOps.length > 0) {
    await Link.bulkWrite(bulkOps, { ordered: false }).catch((err) =>
      logger.error({ err }, 'Failed to reconcile click counters into MongoDB')
    );
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
  await ensureClickHouseSchema();
  await ensureConsumerGroup();
  scheduleGeoIpUpdates();

  const reconcileTimer = setInterval(() => {
    reconcileClickCounters().catch((err) => logger.error({ err }, 'Reconciliation tick failed'));
  }, RECONCILE_INTERVAL_MS);
  reconcileTimer.unref();

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
