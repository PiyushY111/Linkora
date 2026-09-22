import mongoose from 'mongoose';

const webhookDeliverySchema = new mongoose.Schema(
  {
    webhook: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Webhook',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'retrying'],
      required: true,
      index: true,
    },
    responseStatus: {
      type: Number,
      default: null,
    },
    requestHeaders: {
      type: Map,
      of: String,
      default: {},
    },
    requestPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    responseHeaders: {
      type: Map,
      of: String,
      default: {},
    },
    responseBody: {
      type: String,
      default: '',
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
    attempt: {
      type: Number,
      default: 1,
    },
    error: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Auto-expire delivery logs after 30 days to keep database lean
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
webhookDeliverySchema.index({ webhook: 1, createdAt: -1 });

export default mongoose.model('WebhookDelivery', webhookDeliverySchema);
