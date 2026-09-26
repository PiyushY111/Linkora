import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader, resetRateLimits } from '../helpers/testUtils.js';
import { startWebhookReceiver } from '../helpers/webhookReceiver.js';
import Webhook from '../../src/models/Webhook.js';
import WebhookDelivery from '../../src/models/WebhookDelivery.js';
import WebhookEvent from '../../src/models/WebhookEvent.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { dispatchEvent } from '../../src/services/webhookService.js';
import { createWebhookWorker } from '../../src/workers/webhookWorker.js';
import { decryptWebhookSecret, isEncryptedWebhookSecret } from '../../src/lib/webhookSecrets.js';
import { verifySignature } from '../../src/lib/webhookSignature.js';
import { env } from '../../src/config/env.js';

let token;
let user;
let workspace;
let receiver;
let worker;

const api = () => request(app);
const auth = () => authHeader(token);

async function createHook(overrides = {}) {
  const res = await api()
    .post('/api/webhooks')
    .set(auth())
    .send({ url: receiver.url, events: ['link.created'], ...overrides });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

beforeAll(async () => {
  await connectTestDb();
  ({ user, token, workspace } = await createTestUser());
  receiver = await startWebhookReceiver();
  worker = createWebhookWorker({ concurrency: 2, scope: { workspace: workspace._id } });
  await resetRateLimits(['webhook-test', 'webhook-replay']);
});

afterAll(async () => {
  const hooks = await Webhook.find({ workspace: workspace._id }).distinct('_id');
  await WebhookDelivery.deleteMany({ webhook: { $in: hooks } });
  await WebhookEvent.deleteMany({ workspace: workspace._id });
  await Webhook.deleteMany({ workspace: workspace._id });
  await mongoose.model('Workspace').deleteOne({ _id: workspace._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await receiver.close();
  await disconnectTestDb();
  await closeRedis();
});

beforeEach(async () => {
  receiver.respond = { status: 200 };
  receiver.received.length = 0;
  await Webhook.deleteMany({ workspace: workspace._id });
  await WebhookDelivery.deleteMany({ workspace: workspace._id });
});

describe('POST /api/webhooks', () => {
  it('returns the signing secret exactly once and stores it encrypted', async () => {
    const created = await createHook({ events: ['click', 'link.created'], description: '  ops  ' });
    assert.match(created.secret, /^whsec_[0-9a-f]{48}$/);
    assert.strictEqual(created.webhook.secret, undefined);
    assert.deepStrictEqual(created.webhook.events, ['link.clicked', 'link.created']);
    assert.strictEqual(created.webhook.description, 'ops');

    const stored = await Webhook.findById(created.webhook._id).select('+secret').lean();
    assert.ok(isEncryptedWebhookSecret(stored.secret));
    assert.strictEqual(decryptWebhookSecret(stored.secret), created.secret);

    const listed = await api().get('/api/webhooks').set(auth());
    assert.strictEqual(listed.status, 200);
    assert.strictEqual(listed.body.webhooks[0].secret, undefined);
    assert.strictEqual(listed.body.webhooks[0].previousSecret, undefined);
  });

  it('rejects unknown events, unsafe URLs and an empty subscription list with 400', async () => {
    const bad = async (body, pattern) => {
      const res = await api().post('/api/webhooks').set(auth()).send(body);
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
      assert.match(res.body.message, pattern);
    };
    await bad({ url: receiver.url, events: ['link.exploded'] }, /Unknown event types: link.exploded/);
    await bad({ url: receiver.url, events: [] }, /at least one event/);
    await bad({ url: 'http://169.254.169.254/x', events: ['link.created'] }, /Endpoint rejected/);
    await bad({ url: 'ftp://example.com/x', events: ['link.created'] }, /HTTP or HTTPS/);
    await bad({ url: receiver.url, events: ['link.created'], description: 'x'.repeat(201) }, /at most 200/);
  });

  it('caps the number of endpoints per workspace', async () => {
    const saved = env.WEBHOOK_MAX_ENDPOINTS_PER_WORKSPACE;
    env.WEBHOOK_MAX_ENDPOINTS_PER_WORKSPACE = 1;
    try {
      await createHook();
      const res = await api().post('/api/webhooks').set(auth()).send({ url: receiver.url, events: ['link.created'] });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.message, /at most 1 webhook/);
    } finally {
      env.WEBHOOK_MAX_ENDPOINTS_PER_WORKSPACE = saved;
    }
  });
});

describe('GET /api/webhooks/events', () => {
  it('lists the catalog with sample payloads', async () => {
    const res = await api().get('/api/webhooks/events').set(auth());
    assert.strictEqual(res.status, 200);
    const clicked = res.body.events.find((e) => e.type === 'link.clicked');
    assert.deepStrictEqual(clicked.aliases, ['click']);
    assert.ok(clicked.sample.linkId);
  });
});

describe('endpoint lifecycle', () => {
  it('pausing cancels queued deliveries; resuming resets the breaker', async () => {
    const { webhook } = await createHook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'p' }, { sourceKey: `api:${Date.now()}:pause` });
    await Webhook.updateOne({ _id: webhook._id }, { $set: { 'circuit.state': 'open', 'circuit.consecutiveFailures': 7, failingSince: new Date() } });

    const paused = await api().put(`/api/webhooks/${webhook._id}`).set(auth()).send({ isActive: false });
    assert.strictEqual(paused.status, 200);
    assert.strictEqual(paused.body.webhook.isActive, false);
    assert.strictEqual(paused.body.webhook.disabledReason, 'manual');
    assert.strictEqual((await WebhookDelivery.findOne({ webhook: webhook._id }).lean()).status, 'cancelled');

    const resumed = await api().put(`/api/webhooks/${webhook._id}`).set(auth()).send({ isActive: true });
    assert.strictEqual(resumed.body.webhook.isActive, true);
    assert.strictEqual(resumed.body.webhook.disabledReason, null);
    assert.strictEqual(resumed.body.webhook.circuit.state, 'closed');
    assert.strictEqual(resumed.body.webhook.circuit.consecutiveFailures, 0);
    assert.strictEqual(resumed.body.webhook.failingSince, null);
  });

  it('rotates the secret with a grace period during which both signatures are sent', async () => {
    const created = await createHook();
    const rotated = await api().post(`/api/webhooks/${created.webhook._id}/rotate-secret`).set(auth()).send({ gracePeriodHours: 1 });
    assert.strictEqual(rotated.status, 200);
    assert.match(rotated.body.secret, /^whsec_/);
    assert.notStrictEqual(rotated.body.secret, created.secret);
    assert.ok(rotated.body.previousSecretExpiresAt);

    const detail = await api().get(`/api/webhooks/${created.webhook._id}`).set(auth());
    assert.strictEqual(detail.body.webhook.hasPendingSecretRotation, true);

    const ping = await api().post(`/api/webhooks/${created.webhook._id}/test`).set(auth()).send({});
    assert.strictEqual(ping.status, 200);
    const sig = receiver.received.at(-1).headers['linkora-signature'];
    assert.strictEqual(verifySignature(sig, receiver.received.at(-1).body, rotated.body.secret).valid, true);
    assert.strictEqual(verifySignature(sig, receiver.received.at(-1).body, created.secret).valid, true);

    const immediate = await api().post(`/api/webhooks/${created.webhook._id}/rotate-secret`).set(auth()).send({ gracePeriodHours: 0 });
    assert.strictEqual(immediate.body.previousSecretExpiresAt, null);
    const tooLong = await api().post(`/api/webhooks/${created.webhook._id}/rotate-secret`).set(auth()).send({ gracePeriodHours: 999 });
    assert.strictEqual(tooLong.status, 400);
  });

  it('a test ping returns the recorded exchange with the payload that was sent', async () => {
    const { webhook } = await createHook();
    const res = await api().post(`/api/webhooks/${webhook._id}/test`).set(auth()).send({ event: 'link.limit_reached' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.delivery.kind, 'test');
    assert.strictEqual(res.body.delivery.status, 'succeeded');
    assert.strictEqual(res.body.delivery.payload.type, 'link.limit_reached');
    assert.strictEqual(res.body.delivery.attempts[0].responseStatus, 200);
    assert.strictEqual(res.body.delivery.attempts[0].requestHeaders['Linkora-Event'], 'link.limit_reached');

    const unknown = await api().post(`/api/webhooks/${webhook._id}/test`).set(auth()).send({ event: 'nope' });
    assert.strictEqual(unknown.status, 400);
  });
});

describe('deliveries', () => {
  it('lists, filters, details and replays deliveries; bulk replay queues the failed ones', async () => {
    const { webhook } = await createHook({ events: ['link.created', 'link.deleted'] });
    receiver.respond = { status: 500 };
    await dispatchEvent(workspace._id, 'link.created', { linkId: 'd1' }, { sourceKey: `api:${Date.now()}:d1` });
    await dispatchEvent(workspace._id, 'link.deleted', { linkId: 'd2' }, { sourceKey: `api:${Date.now()}:d2` });
    await worker.drainOnce();
    await WebhookDelivery.updateMany({ webhook: webhook._id }, { $set: { status: 'failed' } });

    const list = await api().get(`/api/webhooks/${webhook._id}/deliveries`).set(auth()).query({ status: 'failed' });
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.pagination.totalCount, 2);
    assert.strictEqual(list.body.deliveries[0].attempts, undefined, 'summaries omit attempt bodies');

    const filtered = await api().get(`/api/webhooks/${webhook._id}/deliveries`).set(auth()).query({ event: 'link.deleted' });
    assert.strictEqual(filtered.body.deliveries.length, 1);
    assert.strictEqual((await api().get(`/api/webhooks/${webhook._id}/deliveries`).set(auth()).query({ status: 'bogus' })).status, 400);

    const detail = await api().get(`/api/webhooks/${webhook._id}/deliveries/${list.body.deliveries[0]._id}`).set(auth());
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.body.delivery.attempts.length, 1);
    assert.strictEqual(detail.body.delivery.payload.id, detail.body.delivery.event);

    receiver.respond = { status: 200 };
    const replay = await api().post(`/api/webhooks/${webhook._id}/deliveries/${list.body.deliveries[0]._id}/replay`).set(auth());
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(replay.body.delivery.kind, 'replay');
    assert.strictEqual(replay.body.delivery.status, 'succeeded');

    const bulk = await api().post(`/api/webhooks/${webhook._id}/replay`).set(auth()).send({});
    assert.strictEqual(bulk.status, 202);
    assert.strictEqual(bulk.body.queued, 2);
    assert.strictEqual(await WebhookDelivery.countDocuments({ webhook: webhook._id, kind: 'replay', status: 'pending' }), 2);

    const badWindow = await api().post(`/api/webhooks/${webhook._id}/replay`).set(auth()).send({ since: 'yesterday' });
    assert.strictEqual(badWindow.status, 400);
  });

  it('exposes 24h stats on the list and detail views', async () => {
    const { webhook } = await createHook();
    await dispatchEvent(workspace._id, 'link.created', { linkId: 's1' }, { sourceKey: `api:${Date.now()}:s1` });
    await worker.drainOnce();

    const list = await api().get('/api/webhooks').set(auth());
    const stats = list.body.webhooks.find((w) => w._id === webhook._id).deliveryStats;
    assert.strictEqual(stats.total, 1);
    assert.strictEqual(stats.succeeded, 1);
    assert.strictEqual(stats.successRate, 100);
    assert.strictEqual(stats.recentDeliveries.length, 1);
    assert.strictEqual(stats.recentDeliveries[0].status, 'succeeded');

    const detail = await api().get(`/api/webhooks/${webhook._id}`).set(auth());
    assert.strictEqual(detail.body.stats.last7d.total, 1);
    assert.strictEqual(detail.body.recentDeliveries.length, 1);
  });

  it('404s for a malformed or foreign id rather than 500', async () => {
    assert.strictEqual((await api().get('/api/webhooks/not-an-id').set(auth())).status, 404);
    assert.strictEqual((await api().post('/api/webhooks/not-an-id/test').set(auth()).send({})).status, 404);
    const { webhook } = await createHook();
    assert.strictEqual((await api().get(`/api/webhooks/${webhook._id}/deliveries/nope`).set(auth())).status, 404);
  });
});
