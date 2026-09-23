import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import http from 'http';
import mongoose from 'mongoose';
import { executeDelivery } from '../../src/services/webhookService.js';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import Webhook from '../../src/models/Webhook.js';
import WebhookDelivery from '../../src/models/WebhookDelivery.js';
import { closeRedis } from '../../src/services/cacheService.js';

// Passed as the `attempt` argument so a failing delivery is treated as the
// final attempt (matches RETRY_DELAYS_MS.length) and does NOT schedule a
// background retry via setTimeout — which would otherwise fire ~10s after
// this test file's Mongo/Redis connections are already closed.
const FINAL_ATTEMPT = 5;

let user;
let okServer;
let okPort;
let redirectServer;
let redirectPort;

beforeAll(async () => {
  await connectTestDb();
  ({ user } = await createTestUser());

  okServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, sawBody: body.length > 0 }));
    });
  });
  await new Promise((resolve) => okServer.listen(0, '127.0.0.1', resolve));
  okPort = okServer.address().port;

  redirectServer = http.createServer((req, res) => {
    res.writeHead(302, { Location: 'http://127.0.0.1:1/should-not-be-followed' });
    res.end();
  });
  await new Promise((resolve) => redirectServer.listen(0, '127.0.0.1', resolve));
  redirectPort = redirectServer.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => okServer.close(resolve));
  await new Promise((resolve) => redirectServer.close(resolve));
  await Webhook.deleteMany({ user: user._id });
  await WebhookDelivery.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('webhook delivery: DNS-pinned SSRF re-check + no redirects', () => {
  it('delivers successfully to a validated endpoint (loopback allowed in dev, matching registration policy)', async () => {
    const webhook = await Webhook.create({
      user: user._id,
      url: `http://127.0.0.1:${okPort}/hook`,
      events: ['endpoint.test'],
      secret: 'whsec_test',
    });

    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.responseStatus, 200);
  });

  it('never follows a redirect returned by the endpoint', async () => {
    const webhook = await Webhook.create({
      user: user._id,
      url: `http://127.0.0.1:${redirectPort}/hook`,
      events: ['endpoint.test'],
      secret: 'whsec_test',
    });

    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' }, FINAL_ATTEMPT);
    assert.strictEqual(result.success, false);
    assert.match(result.error, /redirect/i);
  });

  it('rejects a delivery target that resolves only to the cloud metadata address', async () => {
    const webhook = await Webhook.create({
      user: user._id,
      url: 'http://169.254.169.254/latest/meta-data',
      events: ['endpoint.test'],
      secret: 'whsec_test',
    });

    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' }, FINAL_ATTEMPT);
    assert.strictEqual(result.success, false);
    assert.match(result.error, /blocked|private/i);
  });
});
