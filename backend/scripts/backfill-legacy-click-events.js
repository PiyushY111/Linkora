#!/usr/bin/env node
/**
 * One-off migration: replays the legacy `clickevents` collection (a plain
 * collection with a 30-day TTL, used before analytics moved to the
 * time-series collection and rollups) through the analytics repository, so
 * dashboards keep that history. Safe to re-run: each legacy document's _id
 * becomes its event ID, so the repository's idempotency skips anything
 * already backfilled. Link.clicks is not touched; it already includes these
 * clicks.
 *
 * Usage: node scripts/backfill-legacy-click-events.js
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { getRedis } from '../src/services/cacheService.js';
import { getAnalyticsRepository } from '../src/repositories/analytics/analyticsRepository.js';

export const LEGACY_COLLECTION = 'clickevents';
const BATCH_SIZE = 500;

function refererDomain(referer) {
  if (!referer || referer === 'direct') return '';
  try {
    return new URL(referer).hostname;
  } catch {
    return '';
  }
}

function toRecord(doc) {
  return {
    eventId: `legacy-${doc._id}`,
    linkId: String(doc.link),
    userId: doc.user ? String(doc.user) : '',
    shortCode: doc.shortCode || '',
    timestamp: doc.timestamp || doc._id.getTimestamp(),
    ipHash: doc.ipHash || '',
    referrerDomain: refererDomain(doc.referer),
    device: doc.device || '',
    browser: doc.browser || '',
    os: doc.os || '',
    country: doc.country || '',
    city: doc.city || '',
    utmSource: doc.utmSource || '',
    utmMedium: doc.utmMedium || '',
    utmCampaign: doc.utmCampaign || '',
    variantId: doc.variantId || null,
    variantName: doc.variantName || null,
    isBot: Boolean(doc.isBot),
    botName: doc.botName || null,
  };
}

/**
 * Runs against whatever Mongo connection is already open (so tests can call
 * it directly).
 * @returns {Promise<{ scanned: number, applied: number }>}
 */
export async function backfillLegacyClickEvents() {
  const repo = getAnalyticsRepository();
  await repo.ensureReady();
  const cursor = mongoose.connection.db.collection(LEGACY_COLLECTION).find({}).sort({ _id: 1 });

  let scanned = 0;
  let applied = 0;
  let batch = [];
  const flush = async () => {
    const result = await repo.recordClicks(batch, { countLinkClicks: false });
    applied += result.applied.length;
    batch = [];
  };

  for await (const doc of cursor) {
    scanned += 1;
    batch.push(toRecord(doc));
    if (batch.length === BATCH_SIZE) await flush();
  }
  if (batch.length > 0) await flush();
  return { scanned, applied };
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  try {
    await mongoose.connect(env.MONGODB_URI);
    const result = await backfillLegacyClickEvents();
    logger.info(result, 'Legacy click events backfilled');
  } catch (err) {
    logger.error({ err }, 'Legacy click event backfill failed');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    await getRedis().quit();
  }
}
