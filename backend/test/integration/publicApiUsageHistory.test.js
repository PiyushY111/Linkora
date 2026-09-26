import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import ApiKey from '../../src/models/ApiKey.js';
import ApiLog from '../../src/models/ApiLog.js';
import { closeRedis } from '../../src/services/cacheService.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

let user;
let workspace;
let rawKey;
let keyDoc;
let otherKeyDoc;

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

// Noon UTC `daysAgo` days back, so seeded logs never straddle a day boundary.
function utcNoon(daysAgo) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12) - daysAgo * MS_PER_DAY);
}

function utcDate(daysAgo) {
  return utcNoon(daysAgo).toISOString().slice(0, 10);
}

function log(apiKey, daysAgo, method, endpoint, statusCode) {
  const createdAt = utcNoon(daysAgo);
  return {
    user: user._id,
    workspace: workspace._id,
    apiKeyId: apiKey._id,
    apiKeyPrefix: apiKey.prefix,
    method,
    endpoint,
    statusCode,
    latencyMs: 5,
    createdAt,
    updatedAt: createdAt,
  };
}

function getHistory(query = '') {
  return request(app).get(`/api/public/v1/usage/history${query}`).set('x-api-key', rawKey);
}

beforeAll(async () => {
  await connectTestDb();
  ({ user, workspace } = await createTestUser());
  ({ raw: rawKey, doc: keyDoc } = await createApiKey('history key'));
  ({ doc: otherKeyDoc } = await createApiKey('other key'));

  const links = '/api/public/v1/links';
  const usage = '/api/public/v1/usage';
  // Inserted through the driver so the explicit createdAt values survive
  // (Mongoose's timestamps would overwrite them with "now").
  await ApiLog.collection.insertMany([
    // Today: 3 requests, 1 error.
    log(keyDoc, 0, 'GET', links, 200),
    log(keyDoc, 0, 'GET', links, 200),
    log(keyDoc, 0, 'POST', links, 422),
    // 1 day ago: 2 requests, 1 error.
    log(keyDoc, 1, 'GET', links, 200),
    log(keyDoc, 1, 'GET', usage, 500),
    // 2 days ago: nothing.
    // 3 days ago: 1 request, 1 error.
    log(keyDoc, 3, 'POST', links, 400),
    // Outside a 5-day window.
    log(keyDoc, 6, 'GET', usage, 200),
    // Another key's traffic must never be counted.
    log(otherKeyDoc, 0, 'GET', links, 500),
    log(otherKeyDoc, 1, 'DELETE', links, 200),
  ]);
});

afterAll(async () => {
  await ApiLog.deleteMany({ user: user._id });
  await ApiKey.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('GET /api/public/v1/usage/history', () => {
  it('aggregates daily counts, top endpoints and error rate for the calling key only', async () => {
    const res = await getHistory('?days=5');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.days, 5);
    assert.deepStrictEqual(res.body.daily, [
      { date: utcDate(4), count: 0, errorCount: 0 },
      { date: utcDate(3), count: 1, errorCount: 1 },
      { date: utcDate(2), count: 0, errorCount: 0 },
      { date: utcDate(1), count: 2, errorCount: 1 },
      { date: utcDate(0), count: 3, errorCount: 1 },
    ]);
    assert.deepStrictEqual(res.body.topEndpoints, [
      { endpoint: '/api/public/v1/links', method: 'GET', count: 3, errorCount: 0 },
      { endpoint: '/api/public/v1/links', method: 'POST', count: 2, errorCount: 2 },
      { endpoint: '/api/public/v1/usage', method: 'GET', count: 1, errorCount: 1 },
    ]);
    // 3 errors out of 6 requests.
    assert.strictEqual(res.body.errorRate, 50);
  });

  it('defaults to a continuous 7-day series ending today', async () => {
    const res = await getHistory();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.daily.length, 7);
    assert.strictEqual(res.body.daily[0].date, utcDate(6));
    assert.strictEqual(res.body.daily[6].date, utcDate(0));
    assert.strictEqual(res.body.daily[4].count, 0);
  });

  it('rejects days outside 1..30', async () => {
    for (const days of ['0', '31', '2.5', 'abc']) {
      const res = await getHistory(`?days=${days}`);
      assert.strictEqual(res.status, 400, `days=${days}`);
      assert.match(res.body.message, /days must be an integer between 1 and 30/);
    }
  });

  it('refuses legacy keys, whose logs all share apiKeyId: null across users', async () => {
    const legacyKey = `lnk_${crypto.randomBytes(24).toString('hex')}`;
    const { user: legacyUser } = await createTestUser({ apiKey: legacyKey });
    try {
      const res = await request(app).get('/api/public/v1/usage/history').set('x-api-key', legacyKey);

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.daily, undefined);
    } finally {
      await ApiLog.deleteMany({ user: legacyUser._id });
      await mongoose.model('User').deleteOne({ _id: legacyUser._id });
    }
  });

  it('is listed in the OpenAPI spec', async () => {
    const res = await request(app).get('/api/public/v1/openapi.json');

    const entry = res.body.paths['/usage/history']?.get;
    assert.ok(entry);
    assert.deepStrictEqual(entry.parameters[0].schema, { type: 'integer', default: 7, minimum: 1, maximum: 30 });
  });
});
