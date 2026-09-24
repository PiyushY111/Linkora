import { describe, it } from 'vitest';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';
import { getClientIp } from '../../src/utils/helpers.js';

// A minimal app with the same trust-proxy setting as src/app.js
// (TRUST_PROXY_HOPS defaults to 1: one reverse proxy in front).
function appWithTrustedHops(hops) {
  const app = express();
  app.set('trust proxy', hops);
  app.get('/ip', (req, res) => res.json({ ip: getClientIp(req) }));
  return app;
}

describe('getClientIp', () => {
  const app = appWithTrustedHops(1);

  it.each([
    ['CF-Connecting-IP', { 'CF-Connecting-IP': '6.6.6.6' }],
    ['X-Real-IP', { 'X-Real-IP': '6.6.6.6' }],
  ])('ignores a client-supplied %s header', async (_name, headers) => {
    const res = await request(app).get('/ip').set(headers);
    assert.notStrictEqual(res.body.ip, '6.6.6.6');
  });

  it('ignores X-Forwarded-For entries the client wrote before the trusted proxy appended its own', async () => {
    // The client sent "6.6.6.6"; the one trusted proxy appended the real
    // peer address. Only the proxy-appended entry is trustworthy.
    const res = await request(app).get('/ip').set('X-Forwarded-For', '6.6.6.6, 203.0.113.50');
    assert.strictEqual(res.body.ip, '203.0.113.50');
  });

  it('uses the socket address when no proxy is trusted', async () => {
    const res = await request(appWithTrustedHops(0)).get('/ip').set('X-Forwarded-For', '6.6.6.6');
    assert.match(res.body.ip, /^(127\.0\.0\.1|::1)$/);
  });

  it('strips the IPv4-mapped IPv6 prefix', () => {
    assert.strictEqual(getClientIp({ ip: '::ffff:198.51.100.7', headers: {} }), '198.51.100.7');
  });
});
