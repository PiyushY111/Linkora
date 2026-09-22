import mongoose from 'mongoose';

export const WEBHOOK_EVENTS = ['click', 'link.expired', 'abuse.flagged'];

const webhookSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, required: true },
    events: [{ type: String, enum: WEBHOOK_EVENTS }],
    secret: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

webhookSchema.index({ user: 1, events: 1, isActive: 1 });

export default mongoose.model('Webhook', webhookSchema);
