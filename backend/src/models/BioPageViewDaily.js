import mongoose from 'mongoose';

/**
 * Views of one bio page on one UTC day: the per-day breakdown behind
 * BioPage.viewCount (which stays the all-time total). One small document
 * per page per day with at least one view.
 */
const bioPageViewDailySchema = new mongoose.Schema(
  {
    bioPage: { type: mongoose.Schema.Types.ObjectId, ref: 'BioPage', required: true },
    // Midnight UTC of the day counted.
    day: { type: Date, required: true },
    views: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false }
);

bioPageViewDailySchema.index({ bioPage: 1, day: 1 }, { unique: true });

const BioPageViewDaily = mongoose.model('BioPageViewDaily', bioPageViewDailySchema);

export default BioPageViewDaily;
