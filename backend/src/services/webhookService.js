import dns from 'dns';
import cron from 'node-cron';
import mongoose from 'mongoose';
import Webhook from '../models/Webhook.js';
import WebhookDelivery from '../models/WebhookDelivery.js';
import WebhookEvent from '../models/WebhookEvent.js';
import Link from '../models/Link.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { isCloudMetadataHost, isDialable } from '../lib/netPolicy.js';
import { normalizeEventType, sampleEventData, subscriptionNamesFor } from '../lib/webhookEvents.js';
import { MAX_ATTEMPTS, DELIVERY_LEASE_MS, performDelivery } from './webhookDelivery.js';

/**
 * Producer-side webhook API: validate an endpoint, turn something that
 * happened into queued deliveries, and the dashboard's test/replay
 * operations. Sending is services/webhookDelivery.js, driven by
 * workers/webhookWorker.js.
 */

const DUPLICATE_KEY = 11000;
export const MAX_BULK_REPLAY = 1000;
const SYNC_WORKER_ID = 'api-sync';

/**
 * Registration-time endpoint check: http(s) (https only in production), a
 * resolvable host, and no blocked address. Delivery re-checks DNS before
 * every attempt (webhookDelivery.js); this is the early, friendly failure.
 * @param {string} urlStr
 * @param {{ lookup?: typeof dns.promises.lookup }} [deps]
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function isSafeEndpointUrl(urlStr, { lookup = dns.promises.lookup } = {}) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { safe: false, reason: 'Endpoint must be a valid absolute URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'Endpoint must use HTTP or HTTPS' };
  }
  if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'Endpoint must use HTTPS' };
  }
  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'Endpoint URL must not embed credentials' };
  }
  if (isCloudMetadataHost(parsed.hostname)) {
    return { safe: false, reason: 'Endpoint resolves to a blocked address' };
  }

  let addresses;
  try {
    addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  } catch {
    return { safe: false, reason: 'Endpoint hostname could not be resolved' };
  }
  const allowPrivate = env.NODE_ENV !== 'production';
  if (!addresses.some((addr) => isDialable(addr.address, { allowPrivate }))) {
    return { safe: false, reason: 'Endpoint resolves to a blocked address' };
  }
  return { safe: true };
}

function isDuplicateKeyError(err) {
  return err?.code === DUPLICATE_KEY || (Array.isArray(err?.writeErrors) && err.writeErrors.every((e) => e.code === DUPLICATE_KEY));
}

async function insertIgnoringDuplicates(Model, docs) {
  if (docs.length === 0) return;
  try {
    await Model.insertMany(docs, { ordered: false });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
}

/**
 * Fills in `workspaceId` for items that only know their link (a click
 * stream entry or cached link:meta written before those carried it).
 */
async function resolveWorkspaces(items) {
  const missing = items.filter((item) => !item.workspaceId && mongoose.isValidObjectId(item.linkId));
  if (missing.length === 0) return items;
  const links = await Link.find({ _id: { $in: [...new Set(missing.map((i) => i.linkId))] } })
    .select('workspace')
    .lean();
  const byLink = new Map(links.map((link) => [String(link._id), link.workspace]));
  return items.map((item) => (item.workspaceId ? item : { ...item, workspaceId: byLink.get(String(item.linkId)) }));
}

/**
 * Records events and queues one delivery per subscribed endpoint, in bulk.
 * Idempotent by `sourceKey`: re-dispatching the same occurrence finds the
 * existing event and adds only the deliveries that don't exist yet, so a
 * producer may safely run twice (redelivered stream batch, cron on two
 * instances). Returns once the rows are written; sending is the worker's.
 *
 * @param {Array<{ workspaceId?: unknown, linkId?: string, type: string, data: Record<string, unknown>, sourceKey?: string }>} items
 * @returns {Promise<{ events: number, deliveries: number }>}
 */
export async function dispatchEvents(items) {
  const resolved = (await resolveWorkspaces(items))
    .map((item) => ({ ...item, rawType: item.type, type: normalizeEventType(item.type) }))
    .filter((item) => {
      if (!item.type) logger.error({ type: item.rawType }, 'Refusing to dispatch unknown webhook event type');
      return item.type && item.workspaceId;
    });
  if (resolved.length === 0) return { events: 0, deliveries: 0 };

  const workspaceIds = [...new Set(resolved.map((i) => String(i.workspaceId)))];
  const subscriptions = await Webhook.find({ workspace: { $in: workspaceIds }, isActive: true })
    .select('workspace url events')
    .lean();
  const byWorkspace = new Map();
  for (const hook of subscriptions) {
    const key = String(hook.workspace);
    byWorkspace.set(key, [...(byWorkspace.get(key) || []), hook]);
  }

  const wanted = resolved
    .map((item) => {
      const names = new Set(subscriptionNamesFor(item.type));
      const targets = (byWorkspace.get(String(item.workspaceId)) || []).filter((hook) => hook.events.some((e) => names.has(e)));
      return { ...item, targets };
    })
    .filter((item) => item.targets.length > 0);
  if (wanted.length === 0) return { events: 0, deliveries: 0 };

  // Reuse events a previous run already recorded for the same sourceKey.
  const sourceKeys = wanted.map((i) => i.sourceKey).filter(Boolean);
  const existing = sourceKeys.length
    ? await WebhookEvent.find({ sourceKey: { $in: sourceKeys } }).select('sourceKey').lean()
    : [];
  const existingBySource = new Map(existing.map((e) => [e.sourceKey, e._id]));

  const now = new Date();
  const eventDocs = [];
  const withEventIds = wanted.map((item) => {
    const known = item.sourceKey && existingBySource.get(item.sourceKey);
    if (known) return { ...item, eventId: known };
    const doc = new WebhookEvent({ workspace: item.workspaceId, type: item.type, data: item.data, sourceKey: item.sourceKey, createdAt: now });
    eventDocs.push(doc);
    return { ...item, eventId: doc._id };
  });
  await insertIgnoringDuplicates(WebhookEvent, eventDocs);

  // A sourceKey race (two producers inserting the same new key at once)
  // leaves one of them holding an id that never got inserted; re-read.
  const raced = withEventIds.filter((i) => i.sourceKey && !existingBySource.has(i.sourceKey));
  const reread = raced.length
    ? await WebhookEvent.find({ sourceKey: { $in: raced.map((i) => i.sourceKey) } }).select('sourceKey').lean()
    : [];
  const rereadBySource = new Map(reread.map((e) => [e.sourceKey, e._id]));

  const deliveryDocs = withEventIds.flatMap((item) => {
    const eventId = (item.sourceKey && rereadBySource.get(item.sourceKey)) || item.eventId;
    return item.targets.map((hook) => ({
      webhook: hook._id,
      workspace: item.workspaceId,
      event: eventId,
      eventType: item.type,
      kind: 'live',
      url: hook.url,
      status: 'pending',
      maxAttempts: MAX_ATTEMPTS,
      nextAttemptAt: now,
    }));
  });
  await insertIgnoringDuplicates(WebhookDelivery, deliveryDocs);

  return { events: eventDocs.length, deliveries: deliveryDocs.length };
}

/**
 * Queues one event for a workspace's subscribed endpoints.
 * @param {unknown} workspaceId
 * @param {string} type
 * @param {Record<string, unknown>} data
 * @param {{ sourceKey?: string }} [options] idempotency key for producers that may run twice
 */
export async function dispatchEvent(workspaceId, type, data, { sourceKey } = {}) {
  if (!workspaceId) return { events: 0, deliveries: 0 };
  return dispatchEvents([{ workspaceId, type, data, sourceKey }]);
}

/**
 * dispatchEvent for an event about a link whose workspace the caller may
 * not know (a cached link:meta hash written before it carried workspaceId).
 * @param {{ linkId: string, workspaceId?: unknown }} link
 * @param {string} type
 * @param {Record<string, unknown>} data
 * @param {{ sourceKey?: string }} [options]
 */
export async function dispatchLinkEvent({ linkId, workspaceId }, type, data, { sourceKey } = {}) {
  return dispatchEvents([{ workspaceId, linkId, type, data, sourceKey }]);
}

async function findWorkspaceWebhook(webhookId, workspaceId) {
  const webhook = await Webhook.findOne({ _id: webhookId, workspace: workspaceId });
  if (!webhook) throw new NotFoundError('Webhook not found');
  return webhook;
}

/**
 * Creates a delivery already leased to this process and attempts it right
 * away, so the caller gets the full exchange back. A failed replay keeps
 * its remaining attempts and is picked up by the worker like any other.
 */
async function deliverNow(fields) {
  const now = new Date();
  const delivery = await WebhookDelivery.create({
    ...fields,
    status: 'in_flight',
    lockedBy: SYNC_WORKER_ID,
    lockedUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
    nextAttemptAt: now,
  });
  await performDelivery(delivery, { now });
  return WebhookDelivery.findById(delivery._id).lean();
}

/**
 * Sends a synthetic event to an endpoint and returns the recorded delivery.
 * One attempt, never retried, never counted against the endpoint's health.
 * @param {unknown} webhookId
 * @param {unknown} workspaceId
 * @param {string} [eventType] any catalog type; its sample payload is sent
 */
export async function testWebhookEndpoint(webhookId, workspaceId, eventType = 'endpoint.test') {
  const type = normalizeEventType(eventType);
  if (!type) throw new ValidationError('Unknown event type');
  const webhook = await findWorkspaceWebhook(webhookId, workspaceId);
  const event = await WebhookEvent.create({ workspace: workspaceId, type, data: sampleEventData(type) });
  return deliverNow({
    webhook: webhook._id,
    workspace: workspaceId,
    event: event._id,
    eventType: type,
    kind: 'test',
    url: webhook.url,
    maxAttempts: 1,
  });
}

/**
 * Re-sends a past delivery's event to the same endpoint as a fresh
 * delivery (same event id, so the receiver can recognise it), attempting
 * it immediately.
 * @param {unknown} deliveryId
 * @param {unknown} webhookId
 * @param {unknown} workspaceId
 */
export async function replayDelivery(deliveryId, webhookId, workspaceId) {
  const webhook = await findWorkspaceWebhook(webhookId, workspaceId);
  const original = await WebhookDelivery.findOne({ _id: deliveryId, webhook: webhook._id }).lean();
  if (!original) throw new NotFoundError('Delivery not found');
  if (!(await WebhookEvent.exists({ _id: original.event }))) {
    throw new NotFoundError('The event for this delivery has expired and can no longer be replayed');
  }
  return deliverNow({
    webhook: webhook._id,
    workspace: workspaceId,
    event: original.event,
    eventType: original.eventType,
    kind: 'replay',
    replayOf: original._id,
    url: webhook.url,
    maxAttempts: MAX_ATTEMPTS,
  });
}

/**
 * Queues a replay of every failed (or cancelled) delivery to an endpoint in
 * a time window, for the worker to send. Bounded to MAX_BULK_REPLAY rows.
 * @param {unknown} webhookId
 * @param {unknown} workspaceId
 * @param {{ since: Date, until?: Date, statuses?: string[] }} window
 * @returns {Promise<{ queued: number, skipped: number }>}
 */
export async function replayFailedDeliveries(webhookId, workspaceId, { since, until = new Date(), statuses = ['failed'] }) {
  const webhook = await findWorkspaceWebhook(webhookId, workspaceId);
  const failed = await WebhookDelivery.find({
    webhook: webhook._id,
    status: { $in: statuses },
    kind: { $ne: 'test' },
    createdAt: { $gte: since, $lte: until },
  })
    .sort({ createdAt: 1 })
    .limit(MAX_BULK_REPLAY)
    .select('event eventType')
    .lean();
  if (failed.length === 0) return { queued: 0, skipped: 0 };

  const liveEventIds = new Set(
    (await WebhookEvent.find({ _id: { $in: failed.map((d) => d.event) } }).select('_id').lean()).map((e) => e._id)
  );
  const now = new Date();
  const replays = failed
    .filter((d) => liveEventIds.has(d.event))
    .map((d) => ({
      webhook: webhook._id,
      workspace: workspaceId,
      event: d.event,
      eventType: d.eventType,
      kind: 'replay',
      replayOf: d._id,
      url: webhook.url,
      status: 'pending',
      maxAttempts: MAX_ATTEMPTS,
      nextAttemptAt: now,
    }));
  if (replays.length > 0) await WebhookDelivery.insertMany(replays);
  return { queued: replays.length, skipped: failed.length - replays.length };
}

/**
 * Sweeps for links past their expiry and queues link.expired for each,
 * claiming every link first so two instances running the sweep at once
 * can't both announce the same link.
 */
export async function checkExpiredLinks() {
  const now = new Date();
  const candidates = await Link.find({ isActive: true, expiryDate: { $lte: now }, expiryNotified: { $ne: true } })
    .select('_id')
    .lean();

  let dispatched = 0;
  for (const { _id } of candidates) {
    const claimed = await Link.findOneAndUpdate(
      { _id, expiryNotified: { $ne: true } },
      { $set: { expiryNotified: true } },
      { new: true }
    ).lean();
    if (!claimed) continue;
    await dispatchEvent(
      claimed.workspace,
      'link.expired',
      {
        linkId: String(claimed._id),
        shortCode: claimed.shortCode,
        originalUrl: claimed.originalUrl,
        expiryDate: claimed.expiryDate,
      },
      { sourceKey: `link.expired:${claimed._id}` }
    );
    dispatched += 1;
  }

  if (dispatched > 0) logger.info({ count: dispatched }, 'Queued link.expired webhooks');
  return dispatched;
}

/** @returns {import('node-cron').ScheduledTask} */
export function scheduleExpiryWebhookCheck() {
  return cron.schedule('*/15 * * * *', () => {
    checkExpiredLinks().catch((err) => logger.error({ err }, 'Scheduled expiry check failed'));
  });
}

export default {
  isSafeEndpointUrl,
  dispatchEvents,
  dispatchEvent,
  dispatchLinkEvent,
  testWebhookEndpoint,
  replayDelivery,
  replayFailedDeliveries,
  checkExpiredLinks,
  scheduleExpiryWebhookCheck,
};
