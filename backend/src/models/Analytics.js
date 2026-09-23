import mongoose from 'mongoose';

/**
 * Legacy per-link summary document. It is still created alongside each link
 * and populated on link reads, but nothing updates its counters any more:
 * click analytics come from the analytics repository instead. Tracked in
 * docs/KNOWN_BUGS.md.
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
