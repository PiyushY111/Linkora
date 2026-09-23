import crypto from 'crypto';
import mongoose from 'mongoose';
import { UAParser } from 'ua-parser-js';
import { redis } from '../services/cacheService.js';
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
// How many recent stream entry IDs each Link remembers for click-count
// dedup. A redelivered entry is only double-counted if the same link took
// more than this many other clicks between the first attempt and the retry
// (i.e. ~33 clicks/s sustained on one link across a 30s CLAIM_IDLE_MS).
export const APPLIED_CLICK_ID_WINDOW = 1000;

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
 * Enriches, bulk-inserts into ClickHouse, counts into Link.clicks, mirrors
 * into the bounded ClickEvent collection, and XACKs each processed entry.
 * Entries that fail enrichment are left un-acked so XAUTOCLAIM retries them.
 */
export async function processBatch(entries) {
  const clickhouseRows = [];
  const mongoDocs = [];
  const ackIds = [];
  const counted = [];
  const webhookDispatches = [];

  for (const [id, fieldArray] of entries) {
    const fields = streamEntryToObject(fieldArray);
    try {
      const { clickhouseRow, mongoDoc } = await enrichEvent(fields);
      clickhouseRows.push(clickhouseRow);
      mongoDocs.push(mongoDoc);
      ackIds.push(id);
      counted.push({ id, linkId: fields.linkId, timestamp: mongoDoc.timestamp });
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
  // Must succeed before XACK: if it throws, the whole batch stays pending
  // and is retried, which is safe because the increment is idempotent.
  await applyClickCounts(counted);
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
 * Increments Link.clicks once per stream entry. Each entry is its own
 * conditional single-document update (Mongo has no multi-document atomicity
 * without a replica-set transaction), so an entry whose ID is already in the
 * link's appliedClickIds window matches nothing and is a no-op on retry.
 * @param {{ id: string, linkId: string, timestamp: Date }[]} clicks
 */
export async function applyClickCounts(clicks) {
  const ops = [];
  for (const { id, linkId, timestamp } of clicks) {
    if (!mongoose.isValidObjectId(linkId)) {
      logger.warn({ id, linkId }, 'Click event has an invalid linkId; not counted');
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: linkId, appliedClickIds: { $ne: id } },
        update: {
          $inc: { clicks: 1 },
          $max: { lastAccessedAt: timestamp },
          $push: { appliedClickIds: { $each: [id], $slice: -APPLIED_CLICK_ID_WINDOW } },
        },
      },
    });
  }
  if (ops.length > 0) await Link.bulkWrite(ops, { ordered: false });
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
  await ensureClickHouseSchema();
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
