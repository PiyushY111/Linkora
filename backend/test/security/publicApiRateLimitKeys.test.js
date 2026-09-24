import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import ApiKey from '../../src/models/ApiKey.js';
import { closeRedis, getRedis } from '../../src/services/cacheService.js';

let user;
let token;

async function scanKeys(pattern) {
  const found = [];
  let cursor = '0';
  do {
    const [next, keys] = await getRedis().scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
    found.push(...keys);
    cursor = next;
  } while (cursor !== '0');
  return found;
}

beforeAll(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser());
});

afterAll(async () => {
  await ApiKey.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('public API rate-limit keys', () => {
  it('never puts the raw API key into a Redis key name', async () => {
    const created = await request(app).post('/api/developer/keys').set(authHeader(token)).send({ name: 'rl-key-test' });
    assert.strictEqual(created.status, 201);
    const { rawSecret: rawKey } = created.body;
    assert.ok(rawKey, 'the create response carries the raw key once');

    const res = await request(app).get('/api/public/v1/usage').set('x-api-key', rawKey);
    assert.strictEqual(res.status, 200);

    const keys = await scanKeys('ratelimit:public-api:*');
    assert.ok(keys.length > 0, 'the limiter wrote a bucket');
    assert.ok(!keys.some((k) => k.includes(rawKey)), 'raw key found in a Redis key name');
    assert.ok(!keys.some((k) => k.includes(rawKey.slice(-24))), 'part of the raw key found in a Redis key name');
  });

  it('gives each user their own bucket for dashboard-session requests', async () => {
    const { user: other, token: otherToken } = await createTestUser();
    try {
      await request(app).get('/api/public/v1/usage').set(authHeader(token));
      await request(app).get('/api/public/v1/usage').set(authHeader(otherToken));

      const keys = await scanKeys('ratelimit:public-api:*');
      assert.ok(!keys.includes('ratelimit:public-api:dashboard-session'), 'all sessions share one global bucket');
    } finally {
      await ApiKey.deleteMany({ user: other._id });
      await mongoose.model('User').deleteOne({ _id: other._id });
    }
  });
});

// Keeps the hygiene suite's "every key has a TTL" check meaningful.
describe('bucket TTL', () => {
  it('sets a TTL on every public-api bucket', async () => {
    const keys = await scanKeys('ratelimit:public-api:*');
    for (const key of keys) {
      assert.ok((await getRedis().ttl(key)) > 0, `${key} has no TTL`);
    }
  });
});

describe('GET /api/public/v1/usage', () => {
  it('reports the limits the token bucket actually enforces, with or without an API key', async () => {
    // A user with no API key at all: the dashboard-session path.
    const { user: keyless, token: keylessToken } = await createTestUser();
    try {
      const res = await request(app).get('/api/public/v1/usage').set(authHeader(keylessToken));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(Number(res.headers['x-ratelimit-limit']), res.body.rateLimits.burstCapacity);
      assert.deepStrictEqual(
        { burstCapacity: res.body.rateLimits.burstCapacity, refillPerSecond: res.body.rateLimits.refillPerSecond },
        { burstCapacity: 30, refillPerSecond: 10 }
      );
    } finally {
      await mongoose.model('User').deleteOne({ _id: keyless._id });
    }
  });
});
