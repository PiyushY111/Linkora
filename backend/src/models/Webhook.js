import mongoose from 'mongoose';
import { WEBHOOK_EVENT_CATALOG, WEBHOOK_EVENT_TYPES } from '../lib/webhookEvents.js';

export const WEBHOOK_DISABLED_REASONS = ['failing', 'gone', 'manual'];
export const CIRCUIT_STATES = ['closed', 'open', 'half_open'];

// Legacy alias names ('click', 'abuse.flagged') stay valid in storage so
// documents saved before the rename still load; the API only ever writes
// canonical names, and dispatch matches either (lib/webhookEvents.js).
const STORABLE_EVENT_NAMES = [...WEBHOOK_EVENT_TYPES, ...Object.values(WEBHOOK_EVENT_CATALOG).flatMap((def) => def.aliases)];

/**
 * A subscription: where to POST, which events, and how the endpoint has
 * been behaving. `secret`/`previousSecret` are stored encrypted
 * (lib/webhookSecrets.js) and never selected by the API's read paths.
 *
 * The circuit breaker guards a failing endpoint: after a run of failures it
 * opens and pending deliveries are held (not attempted, not counted) until
 * `openUntil`; the next delivery after that is a single probe (half_open)
 * that either closes it again or re-opens it for longer.
 */
const circuitSchema = new mongoose.Schema(
  {
    state: { type: String, enum: CIRCUIT_STATES, default: 'closed' },
    consecutiveFailures: { type: Number, default: 0 },
    // How many times the breaker has tripped since the last success; sets
    // the cooldown length for the next trip.
    trips: { type: Number, default: 0 },
    openedAt: { type: Date, default: null },
    openUntil: { type: Date, default: null },
  },
  { _id: false }
);

const webhookSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Owning workspace; `user` above stays as the creator. Not required in the
    // schema only because scripts/migrate-users-to-workspaces.js backfills
    // documents created before workspaces existed; every create path sets it.
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', index: true },
    url: { type: String, required: true },
    events: [{ type: String, enum: STORABLE_EVENT_NAMES }],
    description: { type: String, default: '' },

    secret: { type: String, required: true, select: false },
    previousSecret: { type: String, default: null, select: false },
    previousSecretExpiresAt: { type: Date, default: null },
    secretRotatedAt: { type: Date, default: null },

    // false = paused by a user or disabled automatically; see disabledReason.
    isActive: { type: Boolean, default: true },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, enum: [...WEBHOOK_DISABLED_REASONS, null], default: null },

    circuit: { type: circuitSchema, default: () => ({}) },
    // Start of the current unbroken run of failures; cleared by a success.
    // An endpoint failing for longer than WEBHOOK_AUTO_DISABLE_AFTER_HOURS
    // is disabled (reason 'failing').
    failingSince: { type: Date, default: null },

    lastDeliveryStatus: { type: String, enum: ['success', 'failed', null], default: null },
    lastDeliveredAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The dispatch query: active subscriptions to an event in a workspace.
webhookSchema.index({ workspace: 1, isActive: 1, events: 1 });

export default mongoose.model('Webhook', webhookSchema);
