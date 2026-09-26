import mongoose from 'mongoose';
import { WEBHOOK_EVENT_RETENTION_DAYS } from './WebhookEvent.js';

export const DELIVERY_STATUSES = ['pending', 'in_flight', 'succeeded', 'failed', 'cancelled'];
export const DELIVERY_KINDS = ['live', 'test', 'replay'];
export const MAX_RECORDED_ATTEMPTS = 10;
export const RESPONSE_PREVIEW_BYTES = 2048;

/**
 * One event bound for one endpoint, and every attempt made to get it
 * there. This is the durable queue: a worker claims `pending` rows whose
 * `nextAttemptAt` has passed (or `in_flight` rows whose lease expired
 * because their worker died), attempts them, and either finishes them or
 * schedules the next attempt. Nothing about a retry lives in process
 * memory, so a restart loses nothing.
 */
const attemptSchema = new mongoose.Schema(
  {
    n: { type: Number, required: true },
    at: { type: Date, required: true },
    outcome: { type: String, enum: ['success', 'retryable', 'fatal'], required: true },
    responseStatus: { type: Number, default: null },
    latencyMs: { type: Number, default: 0 },
    error: { type: String, default: null },
    requestHeaders: { type: Map, of: String, default: {} },
    responseHeaders: { type: Map, of: String, default: {} },
    responseBody: { type: String, default: '' },
  },
  { _id: false }
);

const webhookDeliverySchema = new mongoose.Schema(
  {
    webhook: { type: mongoose.Schema.Types.ObjectId, ref: 'Webhook', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    event: { type: String, ref: 'WebhookEvent', required: true },
    eventType: { type: String, required: true },
    // live: produced by the app. test: dashboard ping, one attempt, never
    // touches endpoint health. replay: a manual re-send of an event.
    kind: { type: String, enum: DELIVERY_KINDS, default: 'live' },
    replayOf: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookDelivery', default: null },
    // Destination at enqueue time, for display; attempts use the live URL.
    url: { type: String, required: true },

    status: { type: String, enum: DELIVERY_STATUSES, default: 'pending' },
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, required: true },
    nextAttemptAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    lockedBy: { type: String, default: null },
    completedAt: { type: Date, default: null },
    // Why a cancelled delivery stopped (endpoint deleted, paused, ...).
    cancelReason: { type: String, default: null },

    lastAttemptAt: { type: Date, default: null },
    lastResponseStatus: { type: Number, default: null },
    lastLatencyMs: { type: Number, default: null },
    lastError: { type: String, default: null },

    attempts: { type: [attemptSchema], default: [] },
  },
  { timestamps: true }
);

// Worker claim scan (due pending rows, expired leases).
webhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
webhookDeliverySchema.index({ status: 1, lockedUntil: 1 });
// Dashboard listings and per-endpoint stats.
webhookDeliverySchema.index({ webhook: 1, createdAt: -1 });
webhookDeliverySchema.index({ workspace: 1, createdAt: -1 });
// One live delivery per (event, endpoint): re-dispatching an event a producer
// already dispatched can't fan out twice. Replays are separate rows.
webhookDeliverySchema.index({ event: 1, webhook: 1 }, { unique: true, partialFilterExpression: { kind: 'live' } });
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 });

export default mongoose.model('WebhookDelivery', webhookDeliverySchema);
