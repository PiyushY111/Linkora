import mongoose from 'mongoose';

/**
 * Ledger of click-stream entries the consumer has claimed, keyed by the
 * stream entry ID. `pending` means claimed but not fully applied (a crash
 * can leave it there); `done` means every write for the event landed and a
 * redelivery can be skipped outright.
 *
 * Only needs to outlive the redelivery window (pending entries are
 * reclaimed within minutes), so a few days is plenty.
 */
export const PROCESSED_EVENT_TTL_SECONDS = 3 * 24 * 60 * 60;

const processedEventSchema = new mongoose.Schema(
  {
    _id: { type: String },
    state: { type: String, enum: ['pending', 'done'], required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'processed_events', versionKey: false, autoIndex: false }
);

processedEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: PROCESSED_EVENT_TTL_SECONDS });

export default mongoose.model('ProcessedEvent', processedEventSchema);
