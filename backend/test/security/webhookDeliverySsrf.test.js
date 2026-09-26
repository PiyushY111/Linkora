import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import http from 'http';
import { sendAttempt, resolveSafeDeliveryAddress } from '../../src/services/webhookDelivery.js';
import { isSafeEndpointUrl } from '../../src/services/webhookService.js';
import { startWebhookReceiver } from '../helpers/webhookReceiver.js';

const headers = { 'Content-Type': 'application/json' };
const body = '{"hello":"world"}';

let receiver;
let redirectServer;
let redirectUrl;
let hugeServer;
let hugeUrl;

beforeAll(async () => {
  receiver = await startWebhookReceiver();

  redirectServer = http.createServer((req, res) => {
    res.writeHead(302, { Location: 'http://127.0.0.1:1/should-not-be-followed' });
    res.end();
  });
  await new Promise((resolve) => redirectServer.listen(0, '127.0.0.1', resolve));
  redirectUrl = `http://127.0.0.1:${redirectServer.address().port}/hook`;

  // Streams far more than the 64 KB read cap, then keeps the socket open.
  hugeServer = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    const chunk = Buffer.alloc(64 * 1024, 'x');
    let sent = 0;
    const push = () => {
      while (sent < 8 * 1024 * 1024) {
        sent += chunk.length;
        if (!res.write(chunk)) return res.once('drain', push);
      }
      res.end();
    };
    push();
  });
  await new Promise((resolve) => hugeServer.listen(0, '127.0.0.1', resolve));
  hugeUrl = `http://127.0.0.1:${hugeServer.address().port}/hook`;
});

afterAll(async () => {
  await receiver.close();
  await new Promise((resolve) => redirectServer.close(resolve));
  hugeServer.closeAllConnections();
  await new Promise((resolve) => hugeServer.close(resolve));
});

describe('webhook delivery: DNS-pinned SSRF re-check, no redirects, bounded reads', () => {
  it('delivers to a validated endpoint (loopback allowed outside production, matching registration policy)', async () => {
    const result = await sendAttempt(receiver.url, body, headers);
    assert.strictEqual(result.outcome, 'success');
    assert.strictEqual(result.responseStatus, 200);
    assert.strictEqual(receiver.received.at(-1).body, body);
  });

  it('never follows a redirect returned by the endpoint, and treats it as fatal', async () => {
    const result = await sendAttempt(redirectUrl, body, headers);
    assert.strictEqual(result.outcome, 'fatal');
    assert.match(result.error, /redirect/i);
  });

  it('rejects a delivery target that is the cloud metadata address', async () => {
    const result = await sendAttempt('http://169.254.169.254/latest/meta-data', body, headers);
    assert.strictEqual(result.outcome, 'fatal');
    assert.match(result.error, /blocked/i);
  });

  it('re-resolves before connecting: a host that rebinds to a blocked address is refused', async () => {
    let calls = 0;
    // Safe at registration, private (link-local) on the very next lookup.
    const lookup = async () => {
      calls += 1;
      return calls === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '169.254.10.10', family: 4 }];
    };
    assert.strictEqual((await isSafeEndpointUrl('http://rebinder.example/hook', { lookup })).safe, true);
    await assert.rejects(resolveSafeDeliveryAddress('rebinder.example', lookup), /blocked or private/);
  });

  it('dials the validated address rather than whatever DNS says at connect time', async () => {
    // The hostname is unresolvable; the injected lookup pins it to the receiver.
    const port = new URL(receiver.url).port;
    const lookup = async () => [{ address: '127.0.0.1', family: 4 }];
    const result = await sendAttempt(`http://pinned.invalid:${port}/hook`, body, headers, { lookup });
    assert.strictEqual(result.outcome, 'success');
    assert.strictEqual(receiver.received.at(-1).headers.host, `pinned.invalid:${port}`);
  });

  it('reads at most a bounded prefix of a huge response body', async () => {
    const result = await sendAttempt(hugeUrl, body, headers);
    assert.strictEqual(result.outcome, 'success');
    assert.ok(result.responseBody.length <= 2048, `preview is ${result.responseBody.length} bytes`);
  });

  it('classifies 5xx and 429 as retryable, honouring Retry-After', async () => {
    receiver.respond = { status: 503, headers: { 'Retry-After': '120' } };
    const result = await sendAttempt(receiver.url, body, headers);
    assert.strictEqual(result.outcome, 'retryable');
    assert.strictEqual(result.retryAfterMs, 120_000);
    receiver.respond = { status: 200 };
  });

  it('classifies 410 Gone as fatal and marks the endpoint gone', async () => {
    receiver.respond = { status: 410 };
    const result = await sendAttempt(receiver.url, body, headers);
    assert.strictEqual(result.outcome, 'fatal');
    assert.strictEqual(result.endpointGone, true);
    receiver.respond = { status: 200 };
  });

  it('turns a connection failure into a retryable outcome with a safe message', async () => {
    // A port that was just listening and is now closed: nothing answers.
    const probe = http.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const closedPort = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));

    const result = await sendAttempt(`http://127.0.0.1:${closedPort}/hook`, body, headers);
    assert.strictEqual(result.outcome, 'retryable');
    assert.match(result.error, /Connection refused/);
  });
});

describe('endpoint registration policy', () => {
  it('rejects non-http(s) schemes, embedded credentials and metadata hosts', async () => {
    assert.strictEqual((await isSafeEndpointUrl('ftp://example.com/x')).safe, false);
    assert.strictEqual((await isSafeEndpointUrl('https://user:pw@example.com/x')).safe, false);
    assert.strictEqual((await isSafeEndpointUrl('http://metadata.google.internal/computeMetadata')).safe, false);
    assert.strictEqual((await isSafeEndpointUrl('not a url')).safe, false);
  });

  it('rejects a host that resolves only to private addresses, and accepts a public one', async () => {
    const privateLookup = async () => [{ address: '10.0.0.5', family: 4 }];
    const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
    const saved = process.env.NODE_ENV;
    const { env } = await import('../../src/config/env.js');
    env.NODE_ENV = 'production';
    try {
      assert.strictEqual((await isSafeEndpointUrl('https://hooks.example/x', { lookup: privateLookup })).safe, false);
      assert.strictEqual((await isSafeEndpointUrl('https://hooks.example/x', { lookup: publicLookup })).safe, true);
      assert.deepStrictEqual(await isSafeEndpointUrl('http://hooks.example/x', { lookup: publicLookup }), {
        safe: false,
        reason: 'Endpoint must use HTTPS',
      });
    } finally {
      env.NODE_ENV = saved;
    }
  });
});
