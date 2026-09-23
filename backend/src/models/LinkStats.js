import mongoose from 'mongoose';
import { env } from '../config/env.js';

/**
 * Pre-aggregated click counters, one document per link per bucket (hour or
 * UTC day), maintained by the click consumer. Dashboards read these instead
 * of raw events.
 *
 * `dims.<dimension>.<encodedValue>` holds `{ a, h }`: all clicks and human
 * (non-bot) clicks. Each dimension is capped per document (see
 * repositories/analytics/rollupDimensions.js), so the document size is
 * bounded. `appliedIds` is the dedup window that makes each update
 * idempotent under redelivery; it is never read by queries.
 */
function linkStatsSchema(collection, { ttlSeconds } = {}) {
  const schema = new mongoose.Schema(
    {
      linkId: { type: mongoose.Schema.Types.ObjectId, required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, default: null },
      bucket: { type: Date, required: true },
      total: { type: Number, default: 0 },
      human: { type: Number, default: 0 },
      bot: { type: Number, default: 0 },
      // Approximate distinct visitors (HyperLogLog); daily buckets only.
      unique: { type: Number, default: 0 },
      dims: { type: mongoose.Schema.Types.Mixed, default: {} },
      appliedIds: { type: [String], select: false },
    },
    { collection, versionKey: false, minimize: true, autoIndex: false }
  );

  // Upsert target and per-link range reads.
  schema.index({ linkId: 1, bucket: 1 }, { unique: true });
  // Per-user summary range reads.
  schema.index({ userId: 1, bucket: 1 });
  if (ttlSeconds) schema.index({ bucket: 1 }, { expireAfterSeconds: ttlSeconds });
  return schema;
}

export const LinkStatsHourly = mongoose.model(
  'LinkStatsHourly',
  linkStatsSchema('link_stats_hourly', { ttlSeconds: env.CLICK_EVENT_RETENTION_DAYS * 24 * 60 * 60 })
);

export const LinkStatsDaily = mongoose.model('LinkStatsDaily', linkStatsSchema('link_stats_daily'));
