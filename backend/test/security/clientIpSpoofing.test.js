import { describe, it, afterAll, afterEach } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { env } from '../../src/config/env.js';
import { getClientIp } from '../../src/utils/helpers.js';
import { createSlidingWindowLimiter } from '../../src/middleware/rateLimiter.js';
import { closeRedis } from '../../src/services/cacheService.js';

const LIMIT = 2;
const originalTrustCloudflare = env.TRUST_CLOUDFLARE;

/**
 * A minimal app with the real sliding-window limiter (LIMIT requests per
 * minute, keyed by getClientIp) and an endpoint that echoes the IP it saw.
 * Each app gets its own key prefix so tests can't share a window.
 */
function buildApp(trustProxyHops) {
  const app = express();
  app.set('trust proxy', trustProxyHops);
  const limiter = createSlidingWindowLimiter({
    windowMs: 60 * 1000,
    max: LIMIT,
    keyPrefix: `test-ip-${crypto.randomBytes(6).toString('hex')}`,
  });
  app.get('/ip', limiter, (req, res) => res.json({ ip: getClientIp(req) }));
  return app;
}

const SPOOFED_HEADERS = [
  { 'X-Forwarded-For': '1.1.1.1' },
  { 'X-Real-IP': '2.2.2.2' },
  { 'CF-Connecting-IP': '3.3.3.3' },
  { 'X-Forwarded-For': '4.4.4.4, 5.5.5.5', 'X-Real-IP': '6.6.6.6', 'CF-Connecting-IP': '7.7.7.7' },
];

afterEach(() => {
  env.TRUST_CLOUDFLARE = originalTrustCloudflare;
});

afterAll(async () => {
  await closeRedis();
});

describe('client IP: spoofed headers are ignored unless trusted', () => {
  it('with no trusted proxy, forwarding headers never change the IP', async () => {
    env.TRUST_CLOUDFLARE = false;
    const app = buildApp(0);
    for (const headers of SPOOFED_HEADERS) {
      const res = await request(app).get('/ip').set(headers);
      if (res.status === 429) continue;
      assert.strictEqual(res.body.ip, '127.0.0.1', `headers ${JSON.stringify(headers)} changed the IP`);
    }
  });

  it('with no trusted proxy, rotating spoofed headers does not escape the rate limit', async () => {
    env.TRUST_CLOUDFLARE = false;
    const app = buildApp(0);
    const statuses = [];
    for (const headers of SPOOFED_HEADERS) {
      statuses.push((await request(app).get('/ip').set(headers)).status);
    }
    assert.deepStrictEqual(statuses, [200, 200, 429, 429]);
  });

  it('with TRUST_PROXY_HOPS=1, the IP is the hop our proxy appended, not the client-supplied ones', async () => {
    const app = buildApp(1);
    // The proxy appends the address it saw to whatever the client sent.
    const res = await request(app).get('/ip').set('X-Forwarded-For', '9.9.9.9, 203.0.113.7').set('X-Real-IP', '8.8.8.8');
    assert.strictEqual(res.body.ip, '203.0.113.7');
  });

  it('with TRUST_PROXY_HOPS=1, faking earlier hops shares one rate-limit key', async () => {
    const app = buildApp(1);
    const statuses = [];
    for (const fake of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
      statuses.push((await request(app).get('/ip').set('X-Forwarded-For', `${fake}, 203.0.113.7`)).status);
    }
    assert.deepStrictEqual(statuses, [200, 200, 429]);
  });

  it('with TRUST_PROXY_HOPS=1, different real clients get separate rate-limit keys', async () => {
    const app = buildApp(1);
    const statuses = [];
    for (const client of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      statuses.push((await request(app).get('/ip').set('X-Forwarded-For', client)).status);
    }
    assert.deepStrictEqual(statuses, [200, 200, 200]);
  });

  it('reads CF-Connecting-IP only when TRUST_CLOUDFLARE is enabled', async () => {
    env.TRUST_CLOUDFLARE = true;
    const trusted = await request(buildApp(0)).get('/ip').set('CF-Connecting-IP', '203.0.113.50');
    assert.strictEqual(trusted.body.ip, '203.0.113.50');

    env.TRUST_CLOUDFLARE = false;
    const ignored = await request(buildApp(0)).get('/ip').set('CF-Connecting-IP', '203.0.113.50');
    assert.strictEqual(ignored.body.ip, '127.0.0.1');
  });
});
