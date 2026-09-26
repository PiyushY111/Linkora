import mongoose from 'mongoose';
import crypto from 'crypto';

export const WEBHOOK_EVENT_RETENTION_DAYS = 30;

/**
 * One thing that happened, as delivered to every subscribed endpoint. The
 * `_id` is the `id` in the payload and the Linkora-Event-Id header, stable
 * across every attempt and replay, so receivers can de-duplicate.
 *
 * `sourceKey` is the producer's own idempotency key (a click's stream entry
 * ID, a link ID for its expiry, ...). A producer that runs twice for the
 * same occurrence (a redelivered stream batch, a cron on two instances)
 * hits the unique index instead of creating a second event.
 */
const webhookEventSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `evt_${crypto.randomBytes(12).toString('hex')}` },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    type: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    sourceKey: { type: String, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

webhookEventSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });
webhookEventSchema.index({ workspace: 1, createdAt: -1 });
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 });

export default mongoose.model('WebhookEvent', webhookEventSchema);
