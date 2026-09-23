import mongoose from 'mongoose';

/**
 * Raw click events (30-day TTL), written by the stream consumer through the
 * analytics repository (repositories/analytics/). This is the analytics
 * source of truth.
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
