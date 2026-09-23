import mongoose from 'mongoose';
import { env } from '../config/env.js';

export const CLICK_EVENTS_COLLECTION = 'click_events';

/**
 * Raw click events in a MongoDB time-series collection, expired after
 * CLICK_EVENT_RETENTION_DAYS. Dashboards never scan this: they read the
 * link_stats_* rollups. Raw events serve only the CSV export and the
 * recent-clicks stream.
 *
 * Time-series collections can't carry unique indexes, so `eventId` (the
 * stream entry ID) is deduplicated through the processed_events ledger,
 * not here.
 */
const clickEventSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, required: true },
    meta: {
      linkId: { type: mongoose.Schema.Types.ObjectId, required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    eventId: { type: String, required: true },
    shortCode: String,
    ip: String,
    ipHash: String,
    referrerDomain: String,
    device: String,
    browser: String,
    os: String,
    country: String,
    city: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
    variantId: String,
    variantName: String,
    isBot: { type: Boolean, default: false },
    botName: String,
  },
  {
    collection: CLICK_EVENTS_COLLECTION,
    timeseries: { timeField: 'timestamp', metaField: 'meta', granularity: 'seconds' },
    expireAfterSeconds: env.CLICK_EVENT_RETENTION_DAYS * 24 * 60 * 60,
    versionKey: false,
    autoCreate: false,
    autoIndex: false,
  }
);

// Recent clicks and CSV export, per link and per user.
clickEventSchema.index({ 'meta.linkId': 1, timestamp: -1 });
clickEventSchema.index({ 'meta.userId': 1, timestamp: -1 });
// Redelivery check: which of these event IDs already have a raw row.
clickEventSchema.index({ eventId: 1 });

export default mongoose.model('ClickEvent', clickEventSchema);
