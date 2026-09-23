import mongoose from 'mongoose';
import Link from '../../models/Link.js';
import ClickEvent from '../../models/ClickEvent.js';
import ProcessedEvent from '../../models/ProcessedEvent.js';
import { LinkStatsHourly, LinkStatsDaily } from '../../models/LinkStats.js';
import { getRedis } from '../../services/cacheService.js';
import { logger } from '../../config/logger.js';
import { DimensionKeyAssigner } from './rollupDimensions.js';
import { ensureAnalyticsCollections } from './analyticsCollections.js';

/**
 * Writes one batch of click events. There are no multi-document
 * transactions here (time-series collections can't be written inside one,
 * and local/dev MongoDB is often standalone), so each write is made
 * idempotent on its own and the batch is safe to replay at any point:
 *
 * 1. Claim each event in processed_events (unique _id = stream entry ID).
 *    Events already `done` are skipped entirely.
 * 2. Raw row in the time-series collection. For events claimed by an
 *    earlier, interrupted attempt, only if no raw row with that eventId
 *    exists yet.
 * 3. Hourly and daily rollups, 4. Link.clicks: each a single-document
 *    conditional update that also pushes the event ID into a bounded
 *    `appliedIds` window in the same document, so a replay matches nothing.
 * 5. Unique visitors: PFADD is a set operation, and the count is written
 *    with $max, so both are naturally idempotent.
 * 6. Mark the events `done`.
 */

// Must be at least CLICK_STREAM_BATCH_SIZE (enforced in env.js): a replay
// is only detected while its ID is still inside the window.
export const APPLIED_ID_WINDOW = 1000;
const HLL_TTL_SECONDS = 2 * 24 * 60 * 60;
const DUPLICATE_KEY = 11000;

export const hourBucket = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()));
export const dayBucket = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const dayStamp = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
export const uniqueVisitorsKey = (linkId, day) => `hll:visitors:${linkId}:${dayStamp(day)}`;

const toObjectId = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);

/**
 * Runs an unordered bulk write and returns the ops that failed with a
 * duplicate-key error; any other write error is thrown.
 */
async function bulkWriteReturningDuplicates(collection, ops) {
  if (ops.length === 0) return [];
  try {
    await collection.bulkWrite(ops, { ordered: false });
    return [];
  } catch (err) {
    const writeErrors = err.writeErrors || [];
    if (writeErrors.length === 0 || writeErrors.some((e) => e.code !== DUPLICATE_KEY)) throw err;
    return writeErrors.map((e) => ops[e.index]);
  }
}

/**
 * A conditional upsert (`appliedIds: { $ne: id }`) that hits a duplicate
 * key means one of two things: a concurrent upsert created the document
 * first, or this event is already in the document's window. Retrying once
 * separates them: the first now matches and applies, the second fails again
 * and is correctly treated as already applied.
 */
async function idempotentUpserts(collection, ops) {
  const duplicates = await bulkWriteReturningDuplicates(collection, ops);
  await bulkWriteReturningDuplicates(collection, duplicates);
}

async function claimEvents(events) {
  const now = new Date();
  let duplicateIds = [];
  try {
    await ProcessedEvent.collection.insertMany(
      events.map((e) => ({ _id: e.eventId, state: 'pending', createdAt: now })),
      { ordered: false }
    );
  } catch (err) {
    const writeErrors = err.writeErrors || [];
    if (writeErrors.length === 0 || writeErrors.some((e) => e.code !== DUPLICATE_KEY)) throw err;
    duplicateIds = writeErrors.map((e) => events[e.index].eventId);
  }

  if (duplicateIds.length === 0) return { toApply: events, resumedIds: new Set() };

  const existing = await ProcessedEvent.collection
    .find({ _id: { $in: duplicateIds } }, { projection: { state: 1 } })
    .toArray();
  const doneIds = new Set(existing.filter((d) => d.state === 'done').map((d) => d._id));
  return {
    toApply: events.filter((e) => !doneIds.has(e.eventId)),
    resumedIds: new Set(duplicateIds.filter((id) => !doneIds.has(id))),
  };
}

async function insertRawEvents(events, resumedIds) {
  let alreadyWritten = new Set();
  if (resumedIds.size > 0) {
    const rows = await ClickEvent.collection
      .find({ eventId: { $in: [...resumedIds] } }, { projection: { eventId: 1 } })
      .toArray();
    alreadyWritten = new Set(rows.map((r) => r.eventId));
  }

  const docs = events
    .filter((e) => !alreadyWritten.has(e.eventId))
    .map((e) => ({
      timestamp: e.timestamp,
      meta: { linkId: e.linkObjectId, userId: e.userObjectId },
      eventId: e.eventId,
      shortCode: e.shortCode,
      ip: e.ip || '',
      ipHash: e.ipHash,
      referrerDomain: e.referrerDomain,
      device: e.device,
      browser: e.browser,
      os: e.os,
      country: e.country,
      city: e.city,
      utmSource: e.utmSource,
      utmMedium: e.utmMedium,
      utmCampaign: e.utmCampaign,
      variantId: e.variantId,
      variantName: e.variantName,
      isBot: e.isBot,
      botName: e.botName,
    }));
  if (docs.length > 0) await ClickEvent.collection.insertMany(docs, { ordered: false });
}

async function applyRollups(Model, bucketOf, events) {
  const targets = new Map();
  for (const e of events) {
    const bucket = bucketOf(e.timestamp);
    targets.set(`${e.linkObjectId}:${bucket.getTime()}`, { linkId: e.linkObjectId, bucket });
  }

  const assigner = new DimensionKeyAssigner();
  const existing = await Model.collection
    .find({ $or: [...targets.values()] }, { projection: { linkId: 1, bucket: 1, dims: 1 } })
    .toArray();
  for (const doc of existing) assigner.seed(`${doc.linkId}:${doc.bucket.getTime()}`, doc.dims);

  const ops = events.map((e) => {
    const bucket = bucketOf(e.timestamp);
    const dims = assigner.assign(`${e.linkObjectId}:${bucket.getTime()}`, e);
    const inc = { total: 1, [e.isBot ? 'bot' : 'human']: 1 };
    for (const [name, key] of Object.entries(dims)) {
      inc[`dims.${name}.${key}.a`] = 1;
      if (!e.isBot) inc[`dims.${name}.${key}.h`] = 1;
    }
    return {
      updateOne: {
        filter: { linkId: e.linkObjectId, bucket, appliedIds: { $ne: e.eventId } },
        update: {
          $inc: inc,
          $setOnInsert: { userId: e.userObjectId },
          $push: { appliedIds: { $each: [e.eventId], $slice: -APPLIED_ID_WINDOW } },
        },
        upsert: true,
      },
    };
  });

  await idempotentUpserts(Model.collection, ops);
}

/**
 * Increments Link.clicks once per event, with the same applied-ID window
 * pattern as the rollups (Link.appliedClickIds). No upsert: a deleted link
 * simply matches nothing.
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
          $push: { appliedClickIds: { $each: [id], $slice: -APPLIED_ID_WINDOW } },
        },
      },
    });
  }
  if (ops.length > 0) await Link.bulkWrite(ops, { ordered: false });
}

const PFADD_COUNT_SCRIPT = `
redis.call('PFADD', KEYS[1], unpack(ARGV, 2))
redis.call('EXPIRE', KEYS[1], ARGV[1])
return redis.call('PFCOUNT', KEYS[1])
`;
let pfaddCountSha = null;

async function pfaddAndCount(key, members) {
  const args = [key, HLL_TTL_SECONDS, ...members];
  try {
    if (!pfaddCountSha) pfaddCountSha = await getRedis().script('LOAD', PFADD_COUNT_SCRIPT);
    return await getRedis().evalsha(pfaddCountSha, 1, ...args);
  } catch (err) {
    if (!String(err.message).includes('NOSCRIPT')) throw err;
    pfaddCountSha = await getRedis().script('LOAD', PFADD_COUNT_SCRIPT);
    return getRedis().evalsha(pfaddCountSha, 1, ...args);
  }
}

/**
 * One Redis command per (link, day) in the batch: PFADD the visitors' IP
 * hashes into that day's HyperLogLog, refresh its 2-day TTL, and read the
 * estimate, which is written into the daily rollup with $max.
 */
async function applyUniqueVisitors(events) {
  const groups = new Map();
  for (const e of events) {
    if (!e.ipHash) continue;
    const day = dayBucket(e.timestamp);
    const key = `${e.linkObjectId}:${day.getTime()}`;
    if (!groups.has(key)) groups.set(key, { linkId: e.linkObjectId, day, members: new Set() });
    groups.get(key).members.add(e.ipHash);
  }

  const ops = await Promise.all(
    [...groups.values()].map(async ({ linkId, day, members }) => {
      const count = await pfaddAndCount(uniqueVisitorsKey(linkId, day), [...members]);
      return { updateOne: { filter: { linkId, bucket: day }, update: { $max: { unique: Number(count) } } } };
    })
  );
  if (ops.length > 0) await LinkStatsDaily.collection.bulkWrite(ops, { ordered: false });
}

/**
 * @param {import('./analyticsRepository.js').ClickEventRecord[]} events
 * @param {{ countLinkClicks?: boolean }} [options] - false only for backfills
 *   of clicks that Link.clicks already includes
 * @returns {Promise<{ applied: import('./analyticsRepository.js').ClickEventRecord[] }>}
 */
export async function recordClicks(events, { countLinkClicks = true } = {}) {
  const valid = [];
  for (const e of events) {
    const linkObjectId = toObjectId(e.linkId);
    if (!linkObjectId) {
      logger.warn({ eventId: e.eventId, linkId: e.linkId }, 'Click event has an invalid linkId; not recorded');
      continue;
    }
    valid.push({ ...e, linkObjectId, userObjectId: toObjectId(e.userId) });
  }
  if (valid.length === 0) return { applied: [] };

  await ensureAnalyticsCollections();
  const { toApply, resumedIds } = await claimEvents(valid);
  if (toApply.length === 0) return { applied: [] };

  await insertRawEvents(toApply, resumedIds);
  await applyRollups(LinkStatsHourly, hourBucket, toApply);
  await applyRollups(LinkStatsDaily, dayBucket, toApply);
  if (countLinkClicks) {
    await applyClickCounts(toApply.map((e) => ({ id: e.eventId, linkId: e.linkId, timestamp: e.timestamp })));
  }
  await applyUniqueVisitors(toApply);
  await ProcessedEvent.collection.updateMany(
    { _id: { $in: toApply.map((e) => e.eventId) } },
    { $set: { state: 'done' } }
  );

  return { applied: toApply.map(({ linkObjectId, userObjectId, ...e }) => e) };
}
