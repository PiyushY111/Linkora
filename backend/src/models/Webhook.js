import mongoose from 'mongoose';

export const WEBHOOK_EVENTS = [
  'link.clicked',
  'link.created',
  'link.updated',
  'link.deleted',
  'link.limit_reached',
  'link.expired',
  'security.abuse_flagged',
  'endpoint.test',
  // Backward compatibility aliases
  'click',
  'abuse.flagged',
];

const webhookSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Owning workspace; `user` above stays as the creator. Not required yet:
    // create paths don't set it until the controller phase, and
    // scripts/migrate-users-to-workspaces.js backfills existing documents.
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', index: true },
    url: { type: String, required: true },
    events: [{ type: String, enum: WEBHOOK_EVENTS }],
    secret: { type: String, required: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    consecutiveFailures: { type: Number, default: 0 },
    lastDeliveryStatus: { type: String, enum: ['success', 'failed', null], default: null },
    lastDeliveredAt: { type: Date, default: null },
    disabledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

webhookSchema.index({ user: 1, events: 1, isActive: 1 });

export default mongoose.model('Webhook', webhookSchema);
