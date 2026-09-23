import mongoose from 'mongoose';
import ClickEvent, { CLICK_EVENTS_COLLECTION } from '../../models/ClickEvent.js';
import ProcessedEvent from '../../models/ProcessedEvent.js';
import { LinkStatsHourly, LinkStatsDaily } from '../../models/LinkStats.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const NAMESPACE_EXISTS = 48;

async function ensureClickEventsCollection() {
  const db = mongoose.connection.db;
  const desiredTtl = env.CLICK_EVENT_RETENTION_DAYS * 24 * 60 * 60;
  const [existing] = await db.listCollections({ name: CLICK_EVENTS_COLLECTION }).toArray();

  if (!existing) {
    try {
      await ClickEvent.createCollection();
    } catch (err) {
      if (err.code !== NAMESPACE_EXISTS) throw err; // another process created it first
    }
  } else if (existing.type !== 'timeseries') {
    throw new Error(`${CLICK_EVENTS_COLLECTION} exists but is not a time-series collection`);
  } else if (existing.options?.expireAfterSeconds !== desiredTtl) {
    await db.command({ collMod: CLICK_EVENTS_COLLECTION, expireAfterSeconds: desiredTtl });
    logger.info({ expireAfterSeconds: desiredTtl }, 'Updated click_events retention');
  }

  // createIndexes, not syncIndexes: never drop indexes on the raw store.
  await ClickEvent.createIndexes();
}

async function ensureCollections() {
  await mongoose.connection.asPromise();
  await ensureClickEventsCollection();
  // syncIndexes also rebuilds the hourly TTL index when the retention changes.
  await Promise.all([ProcessedEvent.syncIndexes(), LinkStatsHourly.syncIndexes(), LinkStatsDaily.syncIndexes()]);
}

let ensured = null;

/**
 * Idempotent, memoized per process: creates the time-series collection and
 * every analytics index. The writer awaits this before its first write, so
 * the unique (linkId, bucket) index always exists before any upsert relies
 * on it; startup calls it too so a misconfiguration fails at boot.
 */
export function ensureAnalyticsCollections() {
  if (!ensured) {
    ensured = ensureCollections().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}
