import { describe, it, beforeAll, afterAll, afterEach, vi } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import ApiKey from '../../src/models/ApiKey.js';
import ApiLog from '../../src/models/ApiLog.js';
import { getUsage } from '../../src/controllers/publicApiController.js';
import {
  createTokenBucketLimiter,
  PUBLIC_API_TOKEN_BUCKET,
  tokenBucketKey,
} from '../../src/middleware/rateLimiter.js';
import { getRedis, closeRedis } from '../../src/services/cacheService.js';

const { capacity } = PUBLIC_API_TOKEN_BUCKET;

let user;
let workspace;
let token;

async function createApiKey(name) {
  const raw = `lnk_test_${crypto.randomBytes(24).toString('hex')}`;
  const doc = await ApiKey.create({
    user: user._id,
    workspace: workspace._id,
    name,
    keyHash: crypto.createHash('sha256').update(raw).digest('hex'),
    prefix: raw.slice(0, 12),
    maskedKey: `${raw.slice(0, 12)}...${raw.slice(-4)}`,
    lastFour: raw.slice(-4),
  });
  return { raw, doc };
}

function freshKeyRequest() {
  return {
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    apiKeyUser: { apiKey: `lnk_test_${crypto.randomBytes(24).toString('hex')}` },
  };
}

function mockResponse() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
    set(name, value) {
      res.headers[name] = value;
      return res;
    },
  };
  return res;
}

beforeAll(async () => {
  await connectTestDb();
  ({ user, workspace, token } = await createTestUser());
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await ApiKey.deleteMany({ user: user._id });
  await ApiLog.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('getUsage remainingTokens', () => {
  it('reports a full bucket for a key that has not made a request yet', async () => {
    const req = freshKeyRequest();
    const res = mockResponse();

    await getUsage(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.rateLimits.remainingTokens, capacity);
    // Peeking must not create the bucket.
    assert.strictEqual(await getRedis().exists(tokenBucketKey(PUBLIC_API_TOKEN_BUCKET.keyPrefix, req)), 0);
  });

  it('reflects tokens consumed by the real limiter without consuming one itself', async () => {
    // Freeze the clock so refill between calls can't make the count drift.
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const limiter = createTokenBucketLimiter(PUBLIC_API_TOKEN_BUCKET);
    const req = freshKeyRequest();
    const consumed = 7;

    for (let i = 0; i < consumed; i += 1) {
      let passed = false;
      await limiter(req, mockResponse(), () => {
        passed = true;
      });
      assert.ok(passed, `request ${i + 1} should be admitted`);
    }

    const first = mockResponse();
    await getUsage(req, first);
    const second = mockResponse();
    await getUsage(req, second);

    assert.strictEqual(first.body.rateLimits.remainingTokens, capacity - consumed);
    assert.strictEqual(second.body.rateLimits.remainingTokens, capacity - consumed);
  });

  it('adds remainingTokens over HTTP without changing the existing fields', async () => {
    const { raw } = await createApiKey('usage test key');

    const res = await request(app).get('/api/public/v1/usage').set('x-api-key', raw);

    assert.strictEqual(res.status, 200);
    const { rateLimits } = res.body;
    assert.strictEqual(rateLimits.algorithm, 'token-bucket');
    assert.strictEqual(rateLimits.burstCapacity, capacity);
    assert.strictEqual(rateLimits.refillPerSecond, PUBLIC_API_TOKEN_BUCKET.refillPerSecond);
    assert.strictEqual(rateLimits.standardWindow, '1 second');
    assert.ok(Number.isInteger(rateLimits.remainingTokens));
    // The limiter spent one token on this very request before getUsage ran.
    assert.ok(rateLimits.remainingTokens < capacity);
    assert.ok(rateLimits.remainingTokens >= capacity - 1);
  });
});

describe('public API token bucket key', () => {
  it('is shared by raw-key requests and dashboard masked-key requests for the same ApiKey', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const limiter = createTokenBucketLimiter(PUBLIC_API_TOKEN_BUCKET);
    const apiKeyDoc = { _id: new mongoose.Types.ObjectId() };
    const rawKeyReq = { ...freshKeyRequest(), apiKeyDoc };
    const maskedKeyReq = { ...freshKeyRequest(), apiKeyDoc, apiKeyUser: { apiKey: 'lnk_test_abc...wxyz' } };

    for (let i = 0; i < 4; i += 1) await limiter(rawKeyReq, mockResponse(), () => {});
    const res = mockResponse();
    await getUsage(maskedKeyReq, res);

    assert.strictEqual(res.body.rateLimits.remainingTokens, capacity - 4);
  });

  it('never puts the raw API key in the Redis key name, over either auth path', async () => {
    const { raw, doc } = await createApiKey('bucket key test');
    const bucketKey = `ratelimit:${PUBLIC_API_TOKEN_BUCKET.keyPrefix}:key:${doc._id}`;

    await request(app).get('/api/public/v1/usage').set('x-api-key', raw).expect(200);
    assert.strictEqual(await getRedis().exists(bucketKey), 1);
    assert.strictEqual(await getRedis().exists(`ratelimit:${PUBLIC_API_TOKEN_BUCKET.keyPrefix}:${raw}`), 0);

    await getRedis().del(bucketKey);
    await request(app).get('/api/public/v1/usage').set(authHeader(token)).set('x-api-key', doc.maskedKey).expect(200);
    assert.strictEqual(await getRedis().exists(bucketKey), 1);
  });
});

describe('API telemetry for usage reads', () => {
  it('does not log GET /usage or /usage/history, but still logs other endpoints', async () => {
    const { raw, doc } = await createApiKey('telemetry test key');
    const get = (path) => request(app).get(`/api/public/v1${path}`).set('x-api-key', raw);

    await get('/usage').expect(200);
    await get('/usage/').expect(200);
    await get('/usage/history?days=7').expect(200);
    await get('/links').expect(200);

    // ApiLog rows are written after the response finishes; wait for the
    // /links row, which was requested last, before checking for the others.
    await vi.waitFor(async () => {
      assert.strictEqual(await ApiLog.countDocuments({ apiKeyId: doc._id, endpoint: '/api/public/v1/links' }), 1);
    });
    const endpoints = await ApiLog.find({ apiKeyId: doc._id }).distinct('endpoint');
    assert.deepStrictEqual(endpoints, ['/api/public/v1/links']);
  });
});

describe('API key activity tracking for usage reads', () => {
  it('does not count dashboard usage polls as key use, but still counts raw-key and other session calls', async () => {
    const { raw, doc } = await createApiKey('activity test key');
    const asDashboard = (path) =>
      request(app).get(`/api/public/v1${path}`).set(authHeader(token)).set('x-api-key', doc.maskedKey);
    const totalRequests = async () => (await ApiKey.findById(doc._id)).totalRequests;

    await asDashboard('/usage').expect(200);
    await asDashboard('/usage/history').expect(200);
    await asDashboard('/links').expect(200);

    // The /links update was issued after the usage polls would have been,
    // so once it lands, any poll update would have landed too.
    await vi.waitFor(async () => assert.strictEqual(await totalRequests(), 1));
    const afterDashboard = await ApiKey.findById(doc._id);
    assert.ok(afterDashboard.lastUsedAt);

    await request(app).get('/api/public/v1/usage').set('x-api-key', raw).expect(200);
    await vi.waitFor(async () => assert.strictEqual(await totalRequests(), 2));
  });
});
