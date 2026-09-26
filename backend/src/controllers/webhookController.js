import mongoose from 'mongoose';
import Webhook from '../models/Webhook.js';
import WebhookDelivery, { DELIVERY_STATUSES, DELIVERY_KINDS } from '../models/WebhookDelivery.js';
import WebhookEvent from '../models/WebhookEvent.js';
import {
  isSafeEndpointUrl,
  testWebhookEndpoint,
  replayDelivery as executeReplayDelivery,
  replayFailedDeliveries,
  MAX_BULK_REPLAY,
} from '../services/webhookService.js';
import { cancelPendingDeliveries } from '../services/webhookDelivery.js';
import { describeEventCatalog, normalizeEventType, normalizeSubscriptions } from '../lib/webhookEvents.js';
import { encryptWebhookSecret, generateWebhookSecret, isEncryptedWebhookSecret } from '../lib/webhookSecrets.js';
import { logAudit, auditSafeUrl } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { env } from '../config/env.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

const MAX_DESCRIPTION_LENGTH = 200;
const MAX_URL_LENGTH = 2048;
const DEFAULT_ROTATION_GRACE_HOURS = 24;
const MAX_ROTATION_GRACE_HOURS = 72;
const DEFAULT_BULK_REPLAY_WINDOW_HOURS = 24;
const MAX_BULK_REPLAY_WINDOW_DAYS = 30;
const DELIVERY_PAGE_LIMIT = 100;
const RECENT_DELIVERIES_ON_DETAIL = 20;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Workspace webhook endpoints. Every handler acts in req.activeWorkspace
 * and requires the 'webhooks:manage' permission (routes/webhooks.js), so a
 * webhook id from another workspace is simply not found.
 */

const deliverySummaryFields =
  'webhook event eventType kind replayOf url status attemptCount maxAttempts nextAttemptAt completedAt cancelReason lastAttemptAt lastResponseStatus lastLatencyMs lastError createdAt';

function assertObjectId(value, what) {
  if (!mongoose.isValidObjectId(value)) throw new NotFoundError(`${what} not found`);
}

async function findWorkspaceWebhook(req) {
  assertObjectId(req.params.id, 'Webhook');
  const webhook = await Webhook.findOne({ _id: req.params.id, workspace: req.activeWorkspace._id });
  if (!webhook) throw new NotFoundError('Webhook not found');
  return webhook;
}

async function validateEndpointUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) {
    throw new ValidationError('A destination URL is required');
  }
  const check = await isSafeEndpointUrl(url.trim());
  if (!check.safe) throw new ValidationError(`Endpoint rejected: ${check.reason}`);
  return url.trim();
}

function validateSubscriptions(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new ValidationError('Subscribe to at least one event');
  }
  const { events: normalized, invalid } = normalizeSubscriptions(events);
  if (invalid.length > 0) throw new ValidationError(`Unknown event types: ${invalid.join(', ')}`);
  return normalized;
}

function validateDescription(description) {
  if (description === undefined || description === null) return '';
  if (typeof description !== 'string') throw new ValidationError('Description must be text');
  const trimmed = description.trim();
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Per-endpoint delivery counts for a window plus the last few outcomes,
 * in two aggregations for any number of endpoints.
 * @param {import('mongoose').Types.ObjectId[]} webhookIds
 * @param {Date} since
 */
async function deliveryStatsFor(webhookIds, since) {
  if (webhookIds.length === 0) return new Map();
  const [windowed, recent] = await Promise.all([
    WebhookDelivery.aggregate([
      { $match: { webhook: { $in: webhookIds }, kind: { $ne: 'test' }, createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$webhook',
          total: { $sum: 1 },
          succeeded: { $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ['$status', ['pending', 'in_flight']] }, 1, 0] } },
          avgLatencyMs: { $avg: '$lastLatencyMs' },
        },
      },
    ]),
    WebhookDelivery.aggregate([
      { $match: { webhook: { $in: webhookIds }, kind: { $ne: 'test' } } },
      {
        $group: {
          _id: '$webhook',
          recent: {
            $topN: {
              n: 5,
              sortBy: { createdAt: -1 },
              output: { _id: '$_id', status: '$status', eventType: '$eventType', responseStatus: '$lastResponseStatus', latencyMs: '$lastLatencyMs', createdAt: '$createdAt' },
            },
          },
        },
      },
    ]),
  ]);
  const recentById = new Map(recent.map((r) => [String(r._id), r.recent]));
  const stats = new Map();
  for (const id of webhookIds) {
    const w = windowed.find((row) => String(row._id) === String(id)) || { total: 0, succeeded: 0, failed: 0, pending: 0, avgLatencyMs: null };
    const settled = w.succeeded + w.failed;
    stats.set(String(id), {
      total: w.total,
      succeeded: w.succeeded,
      failed: w.failed,
      pending: w.pending,
      successRate: settled > 0 ? Math.round((w.succeeded / settled) * 100) : null,
      avgLatencyMs: w.avgLatencyMs === null ? null : Math.round(w.avgLatencyMs),
      recentDeliveries: recentById.get(String(id)) || [],
    });
  }
  return stats;
}

function presentWebhook(doc, stats) {
  const hook = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const { secret: _secret, previousSecret: _previousSecret, ...safe } = hook;
  return {
    ...safe,
    hasPendingSecretRotation: Boolean(hook.previousSecretExpiresAt && hook.previousSecretExpiresAt > new Date()),
    ...(stats && { deliveryStats: stats }),
  };
}

export const listEventCatalog = async (req, res) => {
  res.status(200).json({ success: true, events: describeEventCatalog() });
};

export const createWebhook = async (req, res) => {
  const url = await validateEndpointUrl(req.body.url);
  const events = validateSubscriptions(req.body.events);
  const description = validateDescription(req.body.description);

  const count = await Webhook.countDocuments({ workspace: req.activeWorkspace._id });
  if (count >= env.WEBHOOK_MAX_ENDPOINTS_PER_WORKSPACE) {
    throw new ValidationError(`A workspace can have at most ${env.WEBHOOK_MAX_ENDPOINTS_PER_WORKSPACE} webhook endpoints`);
  }

  const secret = generateWebhookSecret();
  const webhook = await Webhook.create({
    user: req.user.id,
    workspace: req.activeWorkspace._id,
    url,
    events,
    description,
    secret: encryptWebhookSecret(secret),
  });

  logAudit({
    action: 'webhook.create',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(webhook._id),
    ipAddress: getClientIp(req),
    diff: { url: auditSafeUrl(url), events, description },
  });

  // The only time the secret is ever returned.
  res.status(201).json({ success: true, webhook: presentWebhook(webhook), secret });
};

export const listWebhooks = async (req, res) => {
  const webhooks = await Webhook.find({ workspace: req.activeWorkspace._id }).sort({ createdAt: -1 }).lean();
  const stats = await deliveryStatsFor(
    webhooks.map((w) => w._id),
    new Date(Date.now() - 24 * HOUR_MS)
  );
  res.status(200).json({ success: true, webhooks: webhooks.map((w) => presentWebhook(w, stats.get(String(w._id)))) });
};

export const getWebhook = async (req, res) => {
  const webhook = await findWorkspaceWebhook(req);
  const [stats24h, stats7d, recentDeliveries] = await Promise.all([
    deliveryStatsFor([webhook._id], new Date(Date.now() - 24 * HOUR_MS)),
    deliveryStatsFor([webhook._id], new Date(Date.now() - 7 * 24 * HOUR_MS)),
    WebhookDelivery.find({ webhook: webhook._id }).sort({ createdAt: -1 }).limit(RECENT_DELIVERIES_ON_DETAIL).select(deliverySummaryFields).lean(),
  ]);
  res.status(200).json({
    success: true,
    webhook: presentWebhook(webhook, stats24h.get(String(webhook._id))),
    stats: { last24h: stats24h.get(String(webhook._id)), last7d: stats7d.get(String(webhook._id)) },
    recentDeliveries,
  });
};

export const updateWebhook = async (req, res) => {
  const webhook = await findWorkspaceWebhook(req);
  const { url, events, description, isActive } = req.body;
  const update = {};

  if (url !== undefined && url !== webhook.url) update.url = await validateEndpointUrl(url);
  if (events !== undefined) update.events = validateSubscriptions(events);
  if (description !== undefined) update.description = validateDescription(description);

  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') throw new ValidationError('isActive must be true or false');
    if (isActive && !webhook.isActive) {
      // Resuming gives the endpoint a clean slate.
      Object.assign(update, {
        isActive: true,
        disabledAt: null,
        disabledReason: null,
        failingSince: null,
        circuit: { state: 'closed', consecutiveFailures: 0, trips: 0, openedAt: null, openUntil: null },
      });
    } else if (!isActive && webhook.isActive) {
      Object.assign(update, { isActive: false, disabledAt: new Date(), disabledReason: 'manual' });
    }
  }

  const updated = await Webhook.findByIdAndUpdate(webhook._id, { $set: update }, { new: true }).lean();
  if (update.isActive === false) await cancelPendingDeliveries(webhook._id, 'endpoint paused');

  logAudit({
    action: 'webhook.update',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(webhook._id),
    ipAddress: getClientIp(req),
    diff: { ...update, ...(update.url && { url: auditSafeUrl(update.url) }) },
  });

  res.status(200).json({ success: true, webhook: presentWebhook(updated) });
};

export const deleteWebhook = async (req, res) => {
  const webhook = await findWorkspaceWebhook(req);
  await Webhook.deleteOne({ _id: webhook._id });
  await WebhookDelivery.deleteMany({ webhook: webhook._id });

  logAudit({
    action: 'webhook.delete',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(webhook._id),
    ipAddress: getClientIp(req),
  });

  res.status(200).json({ success: true, message: 'Webhook and its delivery history deleted' });
};

export const testWebhook = async (req, res) => {
  assertObjectId(req.params.id, 'Webhook');
  const delivery = await testWebhookEndpoint(req.params.id, req.activeWorkspace._id, req.body?.event || 'endpoint.test');
  res.status(200).json({ success: true, delivery: await withEventPayload(delivery) });
};

export const rotateSecret = async (req, res) => {
  const webhook = await findWorkspaceWebhook(req);
  const requested = req.body?.gracePeriodHours;
  const gracePeriodHours = requested === undefined ? DEFAULT_ROTATION_GRACE_HOURS : Number(requested);
  if (!Number.isFinite(gracePeriodHours) || gracePeriodHours < 0 || gracePeriodHours > MAX_ROTATION_GRACE_HOURS) {
    throw new ValidationError(`gracePeriodHours must be between 0 and ${MAX_ROTATION_GRACE_HOURS}`);
  }

  const current = await Webhook.findById(webhook._id).select('+secret').lean();
  const secret = generateWebhookSecret();
  const now = new Date();
  const previousSecretExpiresAt = gracePeriodHours > 0 ? new Date(now.getTime() + gracePeriodHours * HOUR_MS) : null;
  await Webhook.updateOne(
    { _id: webhook._id },
    {
      $set: {
        secret: encryptWebhookSecret(secret),
        // A secret saved before encryption existed is encrypted on its way out.
        previousSecret: previousSecretExpiresAt
          ? isEncryptedWebhookSecret(current.secret)
            ? current.secret
            : encryptWebhookSecret(current.secret)
          : null,
        previousSecretExpiresAt,
        secretRotatedAt: now,
      },
    }
  );

  logAudit({
    action: 'webhook.rotateSecret',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(webhook._id),
    ipAddress: getClientIp(req),
    diff: { gracePeriodHours },
  });

  res.status(200).json({
    success: true,
    message: previousSecretExpiresAt
      ? `Secret rotated; deliveries carry both signatures until ${previousSecretExpiresAt.toISOString()}`
      : 'Secret rotated; the previous secret is no longer valid',
    secret,
    previousSecretExpiresAt,
  });
};

export const listDeliveries = async (req, res) => {
  const webhook = await findWorkspaceWebhook(req);
  const { page = 1, limit = 20, status, event, kind } = req.query;

  const query = { webhook: webhook._id };
  if (status) {
    if (!DELIVERY_STATUSES.includes(status)) throw new ValidationError('Unknown delivery status');
    query.status = status;
  }
  if (event) {
    const type = normalizeEventType(event);
    if (!type) throw new ValidationError('Unknown event type');
    query.eventType = type;
  }
  if (kind) {
    if (!DELIVERY_KINDS.includes(kind)) throw new ValidationError('Unknown delivery kind');
    query.kind = kind;
  }

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), DELIVERY_PAGE_LIMIT);
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const [deliveries, totalCount] = await Promise.all([
    WebhookDelivery.find(query)
      .sort({ createdAt: -1 })
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit)
      .select(deliverySummaryFields)
      .lean(),
    WebhookDelivery.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    deliveries,
    pagination: { totalCount, page: parsedPage, limit: parsedLimit, pages: Math.ceil(totalCount / parsedLimit) },
  });
};

/** Attaches the event's payload, as sent, to a delivery for display. */
async function withEventPayload(delivery) {
  if (!delivery) return delivery;
  const event = await WebhookEvent.findById(delivery.event).lean();
  return {
    ...delivery,
    payload: event
      ? { id: event._id, type: event.type, createdAt: event.createdAt, workspaceId: String(event.workspace), data: event.data }
      : null,
  };
}

export const getDelivery = async (req, res) => {
  const webhook = await findWorkspaceWebhook(req);
  assertObjectId(req.params.deliveryId, 'Delivery');
  const delivery = await WebhookDelivery.findOne({ _id: req.params.deliveryId, webhook: webhook._id }).lean();
  if (!delivery) throw new NotFoundError('Delivery not found');
  res.status(200).json({ success: true, delivery: await withEventPayload(delivery) });
};

export const replayDelivery = async (req, res) => {
  assertObjectId(req.params.id, 'Webhook');
  assertObjectId(req.params.deliveryId, 'Delivery');
  const delivery = await executeReplayDelivery(req.params.deliveryId, req.params.id, req.activeWorkspace._id);

  logAudit({
    action: 'webhook.replay',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(req.params.id),
    ipAddress: getClientIp(req),
    diff: { deliveryId: String(req.params.deliveryId) },
  });

  res.status(200).json({ success: true, delivery: await withEventPayload(delivery) });
};

export const bulkReplay = async (req, res) => {
  assertObjectId(req.params.id, 'Webhook');
  const now = Date.now();
  const since = req.body?.since ? new Date(req.body.since) : new Date(now - DEFAULT_BULK_REPLAY_WINDOW_HOURS * HOUR_MS);
  const until = req.body?.until ? new Date(req.body.until) : new Date(now);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since > until) {
    throw new ValidationError('since/until must be valid dates with since before until');
  }
  if (now - since.getTime() > MAX_BULK_REPLAY_WINDOW_DAYS * 24 * HOUR_MS) {
    throw new ValidationError(`Replays can reach back at most ${MAX_BULK_REPLAY_WINDOW_DAYS} days`);
  }
  const statuses = req.body?.includeCancelled ? ['failed', 'cancelled'] : ['failed'];

  const result = await replayFailedDeliveries(req.params.id, req.activeWorkspace._id, { since, until, statuses });

  logAudit({
    action: 'webhook.bulkReplay',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(req.params.id),
    ipAddress: getClientIp(req),
    diff: { since, until, queued: result.queued },
  });

  res.status(202).json({ success: true, ...result, limit: MAX_BULK_REPLAY });
};

export default {
  listEventCatalog,
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  rotateSecret,
  listDeliveries,
  getDelivery,
  replayDelivery,
  bulkReplay,
};
