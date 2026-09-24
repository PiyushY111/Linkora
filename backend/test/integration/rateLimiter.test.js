import { describe, it, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {
  createSlidingWindowLimiter,
  createTokenBucketLimiter,
  recordAuthFailure,
  resetAuthFailures,
  isAuthRateLimited,
  authRateLimitMiddleware,
} from '../../src/middleware/rateLimiter.js';
import { closeRedis, getRedis, setActiveRedisClient } from '../../src/services/cacheService.js';

afterAll(async () => {
  await closeRedis();
});

// Each test uses its own prefix so parallel runs never share a window.
const uniquePrefix = (name) => `test-${name}-${crypto.randomBytes(4).toString('hex')}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function appWith(limiter) {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/', limiter, (req, res) => res.json({ ok: true }));
  return app;
}

describe('sliding-window limiter', () => {
  it('admits `max` requests per window, then 429s, and reports what is left', async () => {
    const app = appWith(createSlidingWindowLimiter({ windowMs: 60_000, max: 3, keyPrefix: uniquePrefix('sw') }));

    const statuses = [];
    const remaining = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).get('/');
      statuses.push(res.status);
      remaining.push(res.headers['x-ratelimit-remaining']);
    }
    assert.deepStrictEqual(statuses, [200, 200, 200, 429]);
    assert.deepStrictEqual(remaining, ['2', '1', '0', '0']);
  });

  it('admits requests again once the window has slid past them', async () => {
    const app = appWith(createSlidingWindowLimiter({ windowMs: 300, max: 1, keyPrefix: uniquePrefix('slide') }));
    assert.strictEqual((await request(app).get('/')).status, 200);
    assert.strictEqual((await request(app).get('/')).status, 429);
    await sleep(350);
    assert.strictEqual((await request(app).get('/')).status, 200);
  });

  it('keys windows per client, so one client cannot exhaust another\'s', async () => {
    const app = appWith(createSlidingWindowLimiter({ windowMs: 60_000, max: 1, keyPrefix: uniquePrefix('per-ip') }));
    assert.strictEqual((await request(app).get('/').set('X-Forwarded-For', '203.0.113.1')).status, 200);
    assert.strictEqual((await request(app).get('/').set('X-Forwarded-For', '203.0.113.1')).status, 429);
    assert.strictEqual((await request(app).get('/').set('X-Forwarded-For', '203.0.113.2')).status, 200);
  });

  it('accepts a per-request limit function', async () => {
    const app = express();
    app.get(
      '/',
      (req, res, next) => {
        req.user = { plan: req.query.plan };
        next();
      },
      createSlidingWindowLimiter({
        windowMs: 60_000,
        max: (req) => (req.user.plan === 'pro' ? 2 : 1),
        keyPrefix: uniquePrefix('fn'),
        keyFn: (req) => req.user.plan,
      }),
      (req, res) => res.json({ ok: true })
    );
    assert.strictEqual((await request(app).get('/?plan=pro')).headers['x-ratelimit-limit'], '2');
    assert.strictEqual((await request(app).get('/?plan=free')).headers['x-ratelimit-limit'], '1');
  });

  it('fails open when Redis errors, so an outage does not take the API down', async () => {
    const real = getRedis();
    const broken = new Proxy(real, {
      get(target, prop) {
        if (prop === 'script' || prop === 'evalsha') return async () => { throw new Error('ECONNREFUSED'); };
        return Reflect.get(target, prop);
      },
    });
    const app = appWith(createSlidingWindowLimiter({ windowMs: 60_000, max: 1, keyPrefix: uniquePrefix('open') }));
    setActiveRedisClient(broken);
    try {
      assert.strictEqual((await request(app).get('/')).status, 200);
      assert.strictEqual((await request(app).get('/')).status, 200);
    } finally {
      setActiveRedisClient(real);
    }
  });
});

describe('failed-login counter', () => {
  it('locks an IP out after 5 failures within the window, and a success resets it', async () => {
    const ip = `198.51.100.${crypto.randomInt(1, 250)}-${crypto.randomBytes(3).toString('hex')}`;
    for (let i = 0; i < 4; i += 1) await recordAuthFailure(ip);
    assert.strictEqual(await isAuthRateLimited(ip), false);
    await recordAuthFailure(ip);
    assert.strictEqual(await isAuthRateLimited(ip), true);

    const ttl = await getRedis().ttl(`ratelimit:auth-failures:${ip}`);
    assert.ok(ttl > 0 && ttl <= 15 * 60, `ttl ${ttl}`);

    await resetAuthFailures(ip);
    assert.strictEqual(await isAuthRateLimited(ip), false);
  });

  it('the middleware answers 429 for a locked-out IP', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.post('/login', authRateLimitMiddleware, (req, res) => res.json({ ok: true }));
    const ip = `192.0.2.${crypto.randomInt(1, 250)}`;
    await resetAuthFailures(ip);
    for (let i = 0; i < 5; i += 1) await recordAuthFailure(ip);
    try {
      const res = await request(app).post('/login').set('X-Forwarded-For', ip);
      assert.strictEqual(res.status, 429);
    } finally {
      await resetAuthFailures(ip);
    }
  });
});

describe('token-bucket limiter', () => {
  it('allows a burst up to capacity, then refills at the configured rate', async () => {
    const app = appWith(createTokenBucketLimiter({ capacity: 2, refillPerSecond: 5, keyPrefix: uniquePrefix('tb') }));
    assert.strictEqual((await request(app).get('/')).status, 200);
    assert.strictEqual((await request(app).get('/')).status, 200);
    assert.strictEqual((await request(app).get('/')).status, 429);
    await sleep(250); // 5 tokens/s: at least one token back
    assert.strictEqual((await request(app).get('/')).status, 200);
  });
});
