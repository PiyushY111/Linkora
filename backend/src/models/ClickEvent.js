import mongoose from 'mongoose';

/**
 * Bounded (30-day TTL) recent-click store. Introduced in Phase 2 as the
 * bridge off the unbounded Analytics.clicks array; from Phase 3 onward it's
 * written alongside ClickHouse by the stream consumer as an operational
 * "recent activity" store, while ClickHouse is the source of truth for
 * historical/aggregate analytics queries.
 */
const clickEventSchema = new mongoose.Schema(
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
      index: true,
    },
    shortCode: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
    ipHash: String,
    userAgent: String,
    referer: String,
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
    isBot: {
      type: Boolean,
      default: false,
    },
    botName: String,
  },
  {
    timestamps: false,
  }
);

clickEventSchema.index({ link: 1, timestamp: -1 });
// 30-day TTL index — MongoDB automatically deletes documents once timestamp
// is older than expireAfterSeconds.
clickEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export default mongoose.model('ClickEvent', clickEventSchema);
