import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import Webhook from '../../src/models/Webhook.js';
import WebhookDelivery from '../../src/models/WebhookDelivery.js';
import Link from '../../src/models/Link.js';
import { env } from '../../src/config/env.js';
import { closeRedis, getRedis } from '../../src/services/cacheService.js';
import {
  generateSignature,
  executeDelivery,
  dispatchEvent,
  retryDelivery,
  checkExpiredLinks,
  testWebhookEndpoint,
} from '../../src/services/webhookService.js';

// Deliveries to this URL fail before any network I/O: the address is
// blocked by the SSRF policy. That makes failure paths fast and offline.
const BLOCKED_URL = 'http://10.255.255.1/hook';
const FINAL_ATTEMPT = 5;

let user;
let other;
let server;
let serverUrl;
const received = [];

beforeAll(async () => {
  await connectTestDb();
  ({ user } = await createTestUser());
  ({ user: other } = await createTestUser());

  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}/hook`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const u of [user, other]) {
    await Webhook.deleteMany({ user: u._id });
    await WebhookDelivery.deleteMany({ user: u._id });
    await Link.deleteMany({ user: u._id });
    await mongoose.model('User').deleteOne({ _id: u._id });
  }
  await disconnectTestDb();
  await closeRedis();
});

const hook = (overrides = {}) =>
  Webhook.create({ user: user._id, url: BLOCKED_URL, events: ['link.created'], secret: `whsec_${crypto.randomBytes(8).toString('hex')}`, ...overrides });

describe('signatures', () => {
  it('signs "<t>.<body>" with HMAC-SHA256 in the Linkora-Signature format', () => {
    const { signature, timestamp } = generateSignature('{"a":1}', 'secret', 1700000000);
    const expected = crypto.createHmac('sha256', 'secret').update('1700000000.{"a":1}').digest('hex');
    assert.strictEqual(timestamp, 1700000000);
    assert.strictEqual(signature, `t=1700000000,v1=${expected}`);
  });

  it('a receiver can verify a real delivery with the webhook secret', async () => {
    const webhook = await hook({ url: serverUrl, events: ['endpoint.test'] });
    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' }, 1, null, { allowPrivateNetworks: true });
    assert.strictEqual(result.success, true);

    const { headers, body } = received.at(-1);
    const [, t, v1] = headers['linkora-signature'].match(/^t=(\d+),v1=([0-9a-f]{64})$/);
    const expected = crypto.createHmac('sha256', webhook.secret).update(`${t}.${body}`).digest('hex');
    assert.ok(crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected)));
    assert.strictEqual(headers['linkora-event'], 'endpoint.test');
    assert.strictEqual(JSON.parse(body).data.hello, 'world');
  });
});

describe('retries', () => {
  it('schedules a retry after a failed non-final attempt, and the retry carries the same event id', async () => {
    const webhook = await hook();
    const scheduled = [];
    const schedule = (fn, delayMs) => scheduled.push({ fn, delayMs });

    const first = await executeDelivery(webhook, 'link.created', { n: 1 }, 1, null, { schedule });
    assert.strictEqual(first.success, false);
    assert.strictEqual(scheduled.length, 1);
    assert.ok(scheduled[0].delayMs >= 10000 && scheduled[0].delayMs < 12000, `delay ${scheduled[0].delayMs}`);

    await scheduled[0].fn();
    const attempts = await WebhookDelivery.find({ webhook: webhook._id }).sort({ attempt: 1 }).lean();
    assert.deepStrictEqual(attempts.map((d) => d.attempt), [1, 2]);
    assert.strictEqual(attempts[0].requestPayload.id, attempts[1].requestPayload.id, 'receivers dedupe on the event id');
    assert.strictEqual(attempts[0].requestPayload.createdAt, attempts[1].requestPayload.createdAt);
    assert.strictEqual(attempts[1].status, 'retrying');
  });

  it('marks the final attempt failed, does not schedule another, and writes a dead-letter entry', async () => {
    const webhook = await hook();
    const scheduled = [];
    const result = await executeDelivery(webhook, 'link.created', { n: 2 }, FINAL_ATTEMPT, null, {
      schedule: (fn) => scheduled.push(fn),
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(scheduled.length, 0);
    assert.strictEqual((await WebhookDelivery.findOne({ webhook: webhook._id }).lean()).status, 'failed');

    const dlq = await getRedis().xrevrange(env.WEBHOOK_DLQ_STREAM_KEY, '+', '-', 'COUNT', 50);
    const entry = dlq.map(([, fields]) => Object.fromEntries(fields.flatMap((v, i) => (i % 2 ? [] : [[v, fields[i + 1]]]))));
    assert.ok(entry.some((e) => e.deliveryId === result.deliveryId && e.webhookId === String(webhook._id)));
  });

  it('disables a webhook after 10 consecutive failures, and resets the count on success', async () => {
    const failing = await hook({ consecutiveFailures: 9 });
    await executeDelivery(failing, 'link.created', {}, FINAL_ATTEMPT);
    const disabled = await Webhook.findById(failing._id).lean();
    assert.strictEqual(disabled.consecutiveFailures, 10);
    assert.strictEqual(disabled.isActive, false);

    const recovering = await hook({ url: serverUrl, consecutiveFailures: 4 });
    await executeDelivery(recovering, 'link.created', {}, 1, null, { allowPrivateNetworks: true });
    assert.strictEqual((await Webhook.findById(recovering._id).lean()).consecutiveFailures, 0);
  });
});

describe('dispatchEvent', () => {
  it('delivers only to active webhooks subscribed to the event or its alias', async () => {
    const clicked = await hook({ events: ['link.clicked'] });
    const legacyAlias = await hook({ events: ['click'] });
    const otherEvent = await hook({ events: ['link.deleted'] });
    const inactive = await hook({ events: ['link.clicked'], isActive: false });

    await dispatchEvent(String(user._id), 'click', { linkId: 'x' });
    // Deliveries run in the background; wait until the two expected ones are logged.
    for (let i = 0; i < 50 && (await WebhookDelivery.countDocuments({ event: 'click', user: user._id })) < 2; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const hit = (await WebhookDelivery.find({ event: 'click', user: user._id }).lean()).map((d) => String(d.webhook));
    assert.deepStrictEqual(hit.sort(), [String(clicked._id), String(legacyAlias._id)].sort());
    assert.ok(!hit.includes(String(otherEvent._id)));
    assert.ok(!hit.includes(String(inactive._id)));
  });

  it('does nothing without a user id', async () => {
    await dispatchEvent(undefined, 'click', {});
  });
});

describe('manual replay and test sends', () => {
  it('retryDelivery replays the original event id and payload', async () => {
    const webhook = await hook();
    const original = await executeDelivery(webhook, 'link.created', { replay: true }, FINAL_ATTEMPT);
    const record = await WebhookDelivery.findOne({ webhook: webhook._id }).lean();

    const replay = await retryDelivery(record._id, user._id);
    assert.strictEqual(replay.requestPayload.id, original.requestPayload.id);
    assert.deepStrictEqual(replay.requestPayload.data, { replay: true });
  });

  it('retryDelivery refuses another user\'s delivery', async () => {
    const webhook = await hook();
    await executeDelivery(webhook, 'link.created', {}, FINAL_ATTEMPT);
    const record = await WebhookDelivery.findOne({ webhook: webhook._id }).lean();
    await assert.rejects(() => retryDelivery(record._id, other._id), /not found/i);
  });

  it('testWebhookEndpoint refuses another user\'s webhook', async () => {
    const webhook = await hook();
    await assert.rejects(() => testWebhookEndpoint(webhook._id, other._id), /not found/i);
  });
});

describe('checkExpiredLinks', () => {
  it('announces each newly expired link once', async () => {
    const webhook = await hook({ events: ['link.expired'] });
    const shortCode = `ex${Date.now().toString(36)}`;
    const link = await Link.create({
      user: user._id,
      originalUrl: 'https://example.com/expired',
      shortCode,
      shortUrl: `http://localhost/${shortCode}`,
      expiryDate: new Date(Date.now() - 60_000),
    });

    await checkExpiredLinks();
    await checkExpiredLinks();
    for (let i = 0; i < 50 && !(await WebhookDelivery.exists({ webhook: webhook._id })); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.strictEqual((await Link.findById(link._id).lean()).expiryNotified, true);
    assert.strictEqual(await WebhookDelivery.countDocuments({ webhook: webhook._id, event: 'link.expired' }), 1);
  });
});
