import mongoose from 'mongoose';

/**
 * Rolling counters and top-N summaries only. The unbounded per-click
 * `clicks` array (previously embedded here) hit MongoDB's 16MB BSON
 * document ceiling under sustained traffic; raw click events now live in
 * the ClickEvent collection (30-day TTL) and, from Phase 3 onward, in
 * ClickHouse. This document is updated by the async click consumer, never
 * synchronously on the redirect hot path.
 */
const analyticsSchema = new mongoose.Schema(
  {
    link: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Link',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    summary: {
      totalClicks: {
        type: Number,
        default: 0,
      },
      uniqueClicks: {
        type: Number,
        default: 0,
      },
      conversionRate: {
        type: Number,
        default: 0,
      },
    },
    dailyBuckets: [
      {
        date: { type: String, required: true }, // YYYY-MM-DD
        clicks: { type: Number, default: 0 },
        _id: false,
      },
    ],
    topCountries: [
      {
        country: String,
        clicks: Number,
      },
    ],
    topDevices: [
      {
        device: String,
        clicks: Number,
      },
    ],
    topBrowsers: [
      {
        browser: String,
        clicks: Number,
      },
    ],
    topReferers: [
      {
        referer: String,
        clicks: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for faster queries. The old multikey index on clicks.timestamp was
// dropped along with the clicks array it indexed.
analyticsSchema.index({ link: 1, user: 1 });

export default mongoose.model('Analytics', analyticsSchema);
