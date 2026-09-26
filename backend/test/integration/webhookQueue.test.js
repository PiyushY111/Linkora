import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import { startWebhookReceiver } from '../helpers/webhookReceiver.js';
import Webhook from '../../src/models/Webhook.js';
import WebhookDelivery from '../../src/models/WebhookDelivery.js';
import WebhookEvent from '../../src/models/WebhookEvent.js';
import Link from '../../src/models/Link.js';
import { closeRedis } from '../../src/services/cacheService.js';
import {
  dispatchEvent,
  dispatchEvents,
  dispatchLinkEvent,
  testWebhookEndpoint,
  replayDelivery,
  replayFailedDeliveries,
  checkExpiredLinks,
} from '../../src/services/webhookService.js';
import { MAX_ATTEMPTS, CIRCUIT_OPEN_THRESHOLD, performDelivery } from '../../src/services/webhookDelivery.js';
import { createWebhookWorker, claimDueDelivery } from '../../src/workers/webhookWorker.js';
import { encryptWebhookSecret } from '../../src/lib/webhookSecrets.js';
import { verifySignature } from '../../src/lib/webhookSignature.js';
import { processBatch } from '../../src/consumers/clickConsumer.js';
import { getAnalyticsRepository } from '../../src/repositories/analytics/analyticsRepository.js';

let user;
let workspace;
let receiver;
let worker;

async function hook(overrides = {}) {
  return Webhook.create({
    user: user._id,
    workspace: workspace._id,
    url: receiver.url,
    events: ['link.created', 'link.clicked', 'link.expired'],
    secret: encryptWebhookSecret('whsec_test'),
    ...overrides,
  });
}

/** Makes every pending delivery due now (skips the backoff wait). */
async function makeDue(filter = {}) {
  await WebhookDelivery.updateMany({ workspace: workspace._id, status: 'pending', ...filter }, { $set: { nextAttemptAt: new Date(0) } });
}

beforeAll(async () => {
  await connectTestDb();
  ({ user, workspace } = await createTestUser());
  receiver = await startWebhookReceiver();
  worker = createWebhookWorker({ concurrency: 4, scope: { workspace: workspace._id } });
});

afterAll(async () => {
  const hooks = await Webhook.find({ workspace: workspace._id }).distinct('_id');
  await WebhookDelivery.deleteMany({ webhook: { $in: hooks } });
  await WebhookEvent.deleteMany({ workspace: workspace._id });
  await Webhook.deleteMany({ workspace: workspace._id });
  await Link.deleteMany({ user: user._id });
  await mongoose.model('Workspace').deleteOne({ _id: workspace._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await receiver.close();
  await disconnectTestDb();
  await closeRedis();
});

// Each test starts with no endpoints and an empty queue in this workspace.
beforeEach(async () => {
  receiver.respond = { status: 200 };
  receiver.received.length = 0;
  await Webhook.deleteMany({ workspace: workspace._id });
  await WebhookDelivery.deleteMany({ workspace: workspace._id });
});

describe('dispatch queues durable deliveries', () => {
  it('records one event and one pending delivery per subscribed endpoint, and nothing for the unsubscribed', async () => {
    const subscribed = await hook();
    const other = await hook({ events: ['link.deleted'] });

    const result = await dispatchEvent(workspace._id, 'link.created', { linkId: 'a' }, { sourceKey: `t:${Date.now()}:1` });
    assert.deepStrictEqual(result, { events: 1, deliveries: 1 });

    const [delivery] = await WebhookDelivery.find({ webhook: subscribed._id }).lean();
    assert.strictEqual(delivery.status, 'pending');
    assert.strictEqual(delivery.kind, 'live');
    assert.strictEqual(delivery.maxAttempts, MAX_ATTEMPTS);
    assert.match(delivery.event, /^evt_[0-9a-f]{24}$/);
    assert.strictEqual(await WebhookDelivery.countDocuments({ webhook: other._id }), 0);
  });

  it('is idempotent by sourceKey: dispatching the same occurrence twice queues nothing twice', async () => {
    const h = await hook();
    const sourceKey = `t:${Date.now()}:idem`;
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'b' }, { sourceKey });
    const second = await dispatchEvent(workspace._id, 'link.created', { linkId: 'b' }, { sourceKey });
    assert.strictEqual(second.events, 0);
    assert.strictEqual(await WebhookEvent.countDocuments({ sourceKey }), 1);
    assert.strictEqual(await WebhookDelivery.countDocuments({ webhook: h._id }), 1);
  });

  it('accepts legacy alias names for both the event and the stored subscription', async () => {
    const legacy = await hook({ events: ['click'] });
    await dispatchEvent(workspace._id, 'click', { linkId: 'c' }, { sourceKey: `t:${Date.now()}:alias` });
    const delivery = await WebhookDelivery.findOne({ webhook: legacy._id }).lean();
    assert.strictEqual(delivery.eventType, 'link.clicked');
  });

  it('looks up the workspace from the link when the producer only knows the link', async () => {
    const h = await hook({ events: ['link.limit_reached'] });
    const link = await Link.create({
      user: user._id,
      workspace: workspace._id,
      originalUrl: 'https://example.com/lim',
      shortCode: `wq${Date.now().toString(36)}`,
      shortUrl: `http://localhost/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    });
    await dispatchLinkEvent({ linkId: String(link._id) }, 'link.limit_reached', { linkId: String(link._id) });
    assert.strictEqual(await WebhookDelivery.countDocuments({ webhook: h._id }), 1);
  });

  it('refuses unknown event types without throwing', async () => {
    await hook();
    assert.deepStrictEqual(await dispatchEvents([{ workspaceId: workspace._id, type: 'nope', data: {} }]), { events: 0, deliveries: 0 });
  });
});

describe('the worker delivers, signs, retries and gives up', () => {
  it('sends a signed request with stable event id and increasing attempt numbers', async () => {
    const h = await hook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'sign' }, { sourceKey: `t:${Date.now()}:sign` });
    await worker.drainOnce();

    const delivery = await WebhookDelivery.findOne({ webhook: h._id }).lean();
    assert.strictEqual(delivery.status, 'succeeded');
    assert.strictEqual(delivery.attemptCount, 1);
    assert.strictEqual(delivery.attempts.length, 1);
    assert.strictEqual(delivery.attempts[0].responseStatus, 200);

    const req = receiver.received.at(-1);
    assert.strictEqual(req.headers['linkora-event-id'], delivery.event);
    assert.strictEqual(req.headers['linkora-event'], 'link.created');
    assert.strictEqual(req.headers['linkora-delivery'], String(delivery._id));
    assert.strictEqual(req.headers['linkora-attempt'], '1');
    assert.strictEqual(req.headers['linkly-signature'], undefined);
    assert.strictEqual(req.headers['x-linkora-signature'], undefined);
    assert.deepStrictEqual(verifySignature(req.headers['linkora-signature'], req.body, 'whsec_test'), { valid: true });
    assert.deepStrictEqual(Object.keys(req.json), ['id', 'type', 'createdAt', 'workspaceId', 'data']);
    assert.strictEqual(req.json.id, delivery.event);
    assert.deepStrictEqual(req.json.data, { linkId: 'sign' });
  });

  it('schedules a retry with backoff on a 5xx, keeps the same event id, and succeeds when the endpoint recovers', async () => {
    const h = await hook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'retry' }, { sourceKey: `t:${Date.now()}:retry` });

    receiver.respond = { status: 500 };
    await worker.drainOnce();
    let delivery = await WebhookDelivery.findOne({ webhook: h._id }).lean();
    assert.strictEqual(delivery.status, 'pending');
    assert.strictEqual(delivery.attemptCount, 1);
    assert.ok(delivery.nextAttemptAt > new Date(), 'next attempt is in the future');
    assert.match(delivery.lastError, /HTTP 500/);

    // Not due yet: the worker leaves it alone.
    await worker.drainOnce();
    assert.strictEqual((await WebhookDelivery.findById(delivery._id).lean()).attemptCount, 1);

    receiver.respond = { status: 200 };
    await makeDue({ webhook: h._id });
    await worker.drainOnce();
    delivery = await WebhookDelivery.findById(delivery._id).lean();
    assert.strictEqual(delivery.status, 'succeeded');
    assert.strictEqual(delivery.attemptCount, 2);
    const [first, second] = receiver.received.slice(-2);
    assert.strictEqual(first.headers['linkora-event-id'], second.headers['linkora-event-id']);
    assert.strictEqual(second.headers['linkora-attempt'], '2');
  });

  it('fails after MAX_ATTEMPTS and records at most the last attempts', async () => {
    const h = await hook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'exhaust' }, { sourceKey: `t:${Date.now()}:exhaust` });
    receiver.respond = { status: 502 };
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      // Keep the breaker closed so every round is a real attempt (the
      // breaker itself is covered below).
      await Webhook.updateOne({ _id: h._id }, { $set: { 'circuit.state': 'closed', 'circuit.consecutiveFailures': 0 } });
      await makeDue({ webhook: h._id });
      await worker.drainOnce();
    }
    const delivery = await WebhookDelivery.findOne({ webhook: h._id }).lean();
    assert.strictEqual(delivery.status, 'failed');
    assert.strictEqual(delivery.attemptCount, MAX_ATTEMPTS);
    assert.ok(delivery.attempts.length <= 10);
    assert.ok(delivery.completedAt);
  });

  it('a redirecting endpoint fails immediately with no retry', async () => {
    const h = await hook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'redir' }, { sourceKey: `t:${Date.now()}:redir` });
    receiver.respond = { status: 302, headers: { Location: 'http://127.0.0.1:1/x' } };
    await worker.drainOnce();
    const delivery = await WebhookDelivery.findOne({ webhook: h._id }).lean();
    assert.strictEqual(delivery.status, 'failed');
    assert.strictEqual(delivery.attemptCount, 1);
  });

  it('reclaims a delivery whose worker died mid-attempt once its lease expires', async () => {
    const h = await hook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'lease' }, { sourceKey: `t:${Date.now()}:lease` });
    const stuck = await WebhookDelivery.findOneAndUpdate(
      { webhook: h._id },
      { $set: { status: 'in_flight', lockedBy: 'dead-worker', lockedUntil: new Date(Date.now() - 1000) } },
      { new: true }
    );
    const claimed = await claimDueDelivery('live-worker', new Date(), { workspace: workspace._id });
    assert.strictEqual(String(claimed._id), String(stuck._id));
    assert.strictEqual(claimed.lockedBy, 'live-worker');
    await performDelivery(claimed);
    assert.strictEqual((await WebhookDelivery.findById(stuck._id).lean()).status, 'succeeded');
  });
});

describe('endpoint lifecycle is honoured at attempt time', () => {
  it('cancels pending deliveries when the endpoint is deleted before they are sent', async () => {
    const h = await hook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'del' }, { sourceKey: `t:${Date.now()}:del` });
    await Webhook.deleteOne({ _id: h._id });
    await worker.drainOnce();
    const delivery = await WebhookDelivery.findOne({ webhook: h._id }).lean();
    assert.strictEqual(delivery.status, 'cancelled');
    assert.match(delivery.cancelReason, /deleted/);
    assert.strictEqual(receiver.received.length, 0);
  });

  it('signs with the rotated secret, and with both during the grace period', async () => {
    const h = await hook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'rot' }, { sourceKey: `t:${Date.now()}:rot` });
    await Webhook.updateOne(
      { _id: h._id },
      {
        $set: {
          secret: encryptWebhookSecret('whsec_new'),
          previousSecret: encryptWebhookSecret('whsec_test'),
          previousSecretExpiresAt: new Date(Date.now() + 60_000),
        },
      }
    );
    await worker.drainOnce();
    const req = receiver.received.at(-1);
    assert.strictEqual(verifySignature(req.headers['linkora-signature'], req.body, 'whsec_new').valid, true);
    assert.strictEqual(verifySignature(req.headers['linkora-signature'], req.body, 'whsec_test').valid, true);
    assert.strictEqual(verifySignature(req.headers['linkora-signature'], req.body, 'whsec_other').valid, false);
  });

  it('opens the circuit after consecutive failures, holds deliveries, then probes and closes on recovery', async () => {
    const h = await hook();
    receiver.respond = { status: 500 };
    for (let i = 0; i < CIRCUIT_OPEN_THRESHOLD; i += 1) {
      await dispatchEvent(workspace._id, 'link.created', { linkId: `cb${i}` }, { sourceKey: `t:${Date.now()}:cb:${i}` });
      await worker.drainOnce();
    }
    let reloaded = await Webhook.findById(h._id).lean();
    assert.strictEqual(reloaded.circuit.state, 'open');
    assert.strictEqual(reloaded.circuit.consecutiveFailures, CIRCUIT_OPEN_THRESHOLD);
    assert.ok(reloaded.failingSince);

    // While open, a due delivery is held without an attempt.
    const sentBefore = receiver.received.length;
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'held' }, { sourceKey: `t:${Date.now()}:held` });
    await worker.drainOnce();
    assert.strictEqual(receiver.received.length, sentBefore);
    const held = await WebhookDelivery.findOne({ webhook: h._id, status: 'pending', attemptCount: 0 }).lean();
    assert.ok(held, 'held delivery stays pending with no attempt');
    assert.ok(held.nextAttemptAt >= reloaded.circuit.openUntil);

    // Cooldown over, endpoint healthy: the probe succeeds and closes the circuit.
    receiver.respond = { status: 200 };
    await Webhook.updateOne({ _id: h._id }, { $set: { 'circuit.openUntil': new Date(Date.now() - 1) } });
    await makeDue({ webhook: h._id });
    await worker.drainOnce();
    reloaded = await Webhook.findById(h._id).lean();
    assert.strictEqual(reloaded.circuit.state, 'closed');
    assert.strictEqual(reloaded.circuit.consecutiveFailures, 0);
    assert.strictEqual(reloaded.failingSince, null);
    assert.strictEqual(reloaded.lastDeliveryStatus, 'success');
  });

  it('lets a new probe through when a half-open probe never reported back', async () => {
    const h = await hook({
      circuit: { state: 'half_open', consecutiveFailures: 5, trips: 1, openedAt: new Date(), openUntil: new Date(Date.now() - 5 * 60_000) },
    });
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'stale' }, { sourceKey: `t:${Date.now()}:stale` });
    await worker.drainOnce();
    const reloaded = await Webhook.findById(h._id).lean();
    assert.strictEqual(reloaded.circuit.state, 'closed');
    assert.strictEqual((await WebhookDelivery.findOne({ webhook: h._id }).lean()).status, 'succeeded');
  });

  it('disables an endpoint that answers 410 Gone and cancels its queue', async () => {
    const h = await hook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'g1' }, { sourceKey: `t:${Date.now()}:g1` });
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'g2' }, { sourceKey: `t:${Date.now()}:g2` });
    receiver.respond = { status: 410 };
    // Concurrency 1 so the second delivery is still queued when the first
    // gets the 410.
    await createWebhookWorker({ concurrency: 1, scope: { workspace: workspace._id } }).drainOnce();
    const reloaded = await Webhook.findById(h._id).lean();
    assert.strictEqual(reloaded.isActive, false);
    assert.strictEqual(reloaded.disabledReason, 'gone');
    const statuses = (await WebhookDelivery.find({ webhook: h._id }).lean()).map((d) => d.status).sort();
    assert.deepStrictEqual(statuses, ['cancelled', 'failed']);
  });

  it('disables an endpoint that has been failing for longer than the auto-disable window', async () => {
    const h = await hook({ failingSince: new Date(Date.now() - 100 * 60 * 60_000) });
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'old' }, { sourceKey: `t:${Date.now()}:old` });
    receiver.respond = { status: 500 };
    await worker.drainOnce();
    const reloaded = await Webhook.findById(h._id).lean();
    assert.strictEqual(reloaded.isActive, false);
    assert.strictEqual(reloaded.disabledReason, 'failing');
  });
});

describe('test pings and replays', () => {
  it('a test ping is delivered synchronously, once, without touching endpoint health', async () => {
    const h = await hook();
    receiver.respond = { status: 500 };
    const delivery = await testWebhookEndpoint(h._id, workspace._id, 'link.clicked');
    assert.strictEqual(delivery.kind, 'test');
    assert.strictEqual(delivery.status, 'failed');
    assert.strictEqual(delivery.maxAttempts, 1);
    assert.strictEqual(delivery.attempts[0].responseStatus, 500);
    assert.strictEqual(receiver.received.at(-1).json.type, 'link.clicked');
    assert.ok(receiver.received.at(-1).json.data.referrerDomain !== undefined, 'sample matches the real payload shape');

    const reloaded = await Webhook.findById(h._id).lean();
    assert.strictEqual(reloaded.circuit.consecutiveFailures, 0);
    assert.strictEqual(reloaded.lastDeliveryStatus, null);
    await worker.drainOnce();
    assert.strictEqual((await WebhookDelivery.findById(delivery._id).lean()).attemptCount, 1, 'never retried');
  });

  it('replays a failed delivery as a new delivery of the same event, attempted immediately', async () => {
    const h = await hook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'rp' }, { sourceKey: `t:${Date.now()}:rp` });
    receiver.respond = { status: 500 };
    await worker.drainOnce();
    const original = await WebhookDelivery.findOne({ webhook: h._id }).lean();

    receiver.respond = { status: 200 };
    const replay = await replayDelivery(original._id, h._id, workspace._id);
    assert.strictEqual(replay.kind, 'replay');
    assert.strictEqual(String(replay.replayOf), String(original._id));
    assert.strictEqual(replay.event, original.event);
    assert.strictEqual(replay.status, 'succeeded');
    assert.strictEqual(receiver.received.at(-1).headers['linkora-event-id'], original.event);
  });

  it('bulk-replays failed deliveries in a window and skips ones whose event has expired', async () => {
    const h = await hook();
    receiver.respond = { status: 500 };
    for (let i = 0; i < 3; i += 1) {
      await dispatchEvent(workspace._id, 'link.created', { linkId: `bulk${i}` }, { sourceKey: `t:${Date.now()}:bulk:${i}` });
    }
    await worker.drainOnce();
    await WebhookDelivery.updateMany({ webhook: h._id }, { $set: { status: 'failed' } });
    const expired = await WebhookDelivery.findOne({ webhook: h._id }).lean();
    await WebhookEvent.deleteOne({ _id: expired.event });

    const result = await replayFailedDeliveries(h._id, workspace._id, { since: new Date(Date.now() - 60_000) });
    assert.deepStrictEqual(result, { queued: 2, skipped: 1 });
    assert.strictEqual(await WebhookDelivery.countDocuments({ webhook: h._id, kind: 'replay', status: 'pending' }), 2);
  });
});

describe('producers', () => {
  it('the click consumer queues link.clicked with the stream id as idempotency key, before ACKing', async () => {
    const h = await hook({ events: ['link.clicked'] });
    const link = await Link.create({
      user: user._id,
      workspace: workspace._id,
      originalUrl: 'https://example.com/clicked',
      shortCode: `wc${Date.now().toString(36)}`,
      shortUrl: `http://localhost/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    });
    const acked = [];
    const redis = { xack: async (...args) => acked.push(args) };
    const id = `${Date.now()}-0`;
    const entry = [id, ['linkId', String(link._id), 'workspaceId', String(workspace._id), 'shortCode', link.shortCode, 'timestamp', String(Date.now()), 'ip', '203.0.113.9', 'ua', 'Mozilla/5.0', 'referer', 'https://news.ycombinator.com/item']];

    await processBatch([entry], { redis });
    await processBatch([entry], { redis }); // redelivered batch

    assert.strictEqual(acked.length, 2);
    const deliveries = await WebhookDelivery.find({ webhook: h._id }).lean();
    assert.strictEqual(deliveries.length, 1);
    const event = await WebhookEvent.findById(deliveries[0].event).lean();
    assert.strictEqual(event.sourceKey, `click:${id}`);
    assert.strictEqual(event.data.referrerDomain, 'news.ycombinator.com');
    assert.strictEqual(event.data.linkId, String(link._id));
    await getAnalyticsRepository().deleteAnalytics({ linkId: String(link._id) });
  });

  it('the expiry sweep claims each link once, so two concurrent sweeps produce one event', async () => {
    const h = await hook({ events: ['link.expired'] });
    const link = await Link.create({
      user: user._id,
      workspace: workspace._id,
      originalUrl: 'https://example.com/exp',
      shortCode: `we${Date.now().toString(36)}`,
      shortUrl: `http://localhost/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      expiryDate: new Date(Date.now() - 1000),
    });
    const [a, b] = await Promise.all([checkExpiredLinks(), checkExpiredLinks()]);
    assert.strictEqual(a + b, 1);
    assert.strictEqual(await WebhookDelivery.countDocuments({ webhook: h._id, eventType: 'link.expired' }), 1);
    assert.strictEqual((await Link.findById(link._id).lean()).expiryNotified, true);
  });
});
