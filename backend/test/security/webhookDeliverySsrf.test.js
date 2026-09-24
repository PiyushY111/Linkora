import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import http from 'http';
import mongoose from 'mongoose';
import { executeDelivery, isSafeEndpointUrl } from '../../src/services/webhookService.js';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import Webhook from '../../src/models/Webhook.js';
import WebhookDelivery from '../../src/models/WebhookDelivery.js';
import { closeRedis } from '../../src/services/cacheService.js';

// Passed as the `attempt` argument so a failing delivery is treated as the
// final attempt (MAX_ATTEMPTS in webhookService.js) and does NOT schedule a
// background retry via setTimeout — which would otherwise fire ~10s after
// this test file's Mongo/Redis connections are already closed.
const FINAL_ATTEMPT = 5;

let user;
let okServer;
let okPort;
let okServerHits = 0;
let redirectServer;
let redirectPort;

beforeAll(async () => {
  await connectTestDb();
  ({ user } = await createTestUser());

  okServer = http.createServer((req, res) => {
    okServerHits += 1;
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
  it('delivers to a loopback endpoint only when private targets are explicitly allowed', async () => {
    const webhook = await Webhook.create({
      user: user._id,
      url: `http://127.0.0.1:${okPort}/hook`,
      events: ['endpoint.test'],
      secret: 'whsec_test',
    });

    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' }, 1, null, {
      allowPrivateNetworks: true,
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.responseStatus, 200);
  });

  it('refuses a loopback endpoint by default', async () => {
    const webhook = await Webhook.create({
      user: user._id,
      url: `http://127.0.0.1:${okPort}/hook`,
      events: ['endpoint.test'],
      secret: 'whsec_test',
    });

    const hitsBefore = okServerHits;
    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' }, FINAL_ATTEMPT);
    assert.strictEqual(result.success, false);
    assert.match(result.error, /blocked|private|restricted/i);
    assert.strictEqual(okServerHits, hitsBefore);
  });

  it('refuses a hex-encoded loopback literal (http://0x7f000001)', async () => {
    const webhook = await Webhook.create({
      user: user._id,
      url: `http://0x7f000001:${okPort}/hook`,
      events: ['endpoint.test'],
      secret: 'whsec_test',
    });

    const hitsBefore = okServerHits;
    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' }, FINAL_ATTEMPT);
    assert.strictEqual(result.success, false);
    assert.strictEqual(okServerHits, hitsBefore);
  });

  it('connects to the address returned by the connect-time lookup', async () => {
    // Not resolvable by real DNS: a success proves the dispatcher dialled
    // the address our lookup returned.
    const webhook = await Webhook.create({
      user: user._id,
      url: `http://hooks.linkora.test:${okPort}/hook`,
      events: ['endpoint.test'],
      secret: 'whsec_test',
    });
    const lookup = async () => [{ address: '127.0.0.1', family: 4 }];

    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' }, 1, null, {
      lookup,
      allowPrivateNetworks: true,
    });
    assert.strictEqual(result.success, true);
  });

  it('blocks DNS rebinding: public at registration, private at delivery', async () => {
    const url = `http://rebind.linkora.test:${okPort}/hook`;
    const answers = ['93.184.216.34', '127.0.0.1'];
    let calls = 0;
    const rebindingLookup = async () => {
      const address = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      return [{ address, family: 4 }];
    };

    const registration = await isSafeEndpointUrl(url, { lookup: rebindingLookup });
    assert.strictEqual(registration.safe, true, 'first answer is public, so registration passes');

    const webhook = await Webhook.create({ user: user._id, url, events: ['endpoint.test'], secret: 'whsec_test' });
    const hitsBefore = okServerHits;
    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' }, FINAL_ATTEMPT, null, {
      lookup: rebindingLookup,
    });

    assert.strictEqual(calls, 2, 'delivery must resolve DNS again rather than reuse the registration answer');
    assert.strictEqual(result.success, false);
    assert.match(result.error, /blocked|private|restricted/i);
    assert.strictEqual(okServerHits, hitsBefore, 'no request may reach the private address');
  });

  it('does not echo resolver error details back to the caller', async () => {
    const failingLookup = async () => {
      throw new Error('getaddrinfo ENOTFOUND db.internal.corp');
    };
    const result = await isSafeEndpointUrl('https://nowhere.example.com/hook', { lookup: failingLookup });
    assert.strictEqual(result.safe, false);
    assert.doesNotMatch(result.reason, /internal\.corp|getaddrinfo/);
  });

  it('never follows a redirect returned by the endpoint', async () => {
    const webhook = await Webhook.create({
      user: user._id,
      url: `http://127.0.0.1:${redirectPort}/hook`,
      events: ['endpoint.test'],
      secret: 'whsec_test',
    });

    const result = await executeDelivery(webhook, 'endpoint.test', { hello: 'world' }, FINAL_ATTEMPT, null, {
      allowPrivateNetworks: true,
    });
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
