import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import { redis, cacheRedis } from '../../src/services/cacheService.js';
import { processBatch } from '../../src/consumers/clickConsumer.js';

let user;
let token;
let link;

function streamEntry(id, fields) {
  return [id, Object.entries(fields).flatMap(([k, v]) => [k, String(v)])];
}

beforeAll(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser());
  const shortCode = `ae${Date.now().toString(36)}`;
  link = await Link.create({
    user: user._id,
    originalUrl: 'https://example.com/analytics',
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
  });

  const base = {
    linkId: String(link._id),
    shortCode,
    userId: String(user._id),
    ip: '127.0.0.1',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    timestamp: Date.now(),
  };
  await processBatch([
    streamEntry('10-0', { ...base, referer: 'https://news.ycombinator.com/item?id=1', utmSource: 'hn' }),
    streamEntry('10-1', { ...base, referer: 'direct', utmSource: '=HYPERLINK("http://evil")' }),
  ]);
});

afterAll(async () => {
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await redis.quit();
  await cacheRedis.quit();
});

describe('analytics endpoints (MongoDB analytics repository)', () => {
  it('GET /api/analytics/link/:id reports processed clicks and recent clicks in the stream shape', async () => {
    const res = await request(app).get(`/api/analytics/link/${link._id}`).set(authHeader(token));

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.analytics.totalClicks, 2);
    assert.strictEqual(res.body.analytics.botBreakdown.humanClicks, 2);
    assert.strictEqual(res.body.recentClicks.length, 2);

    const recent = res.body.recentClicks.find((c) => c.referrer_domain === 'news.ycombinator.com');
    assert.ok(recent, 'recent clicks carry the referrer domain');
    for (const key of ['event_id', 'timestamp', 'country_code', 'device_type', 'browser_family', 'os_family']) {
      assert.ok(key in recent, `recent click has ${key}`);
    }
  });

  it('GET /api/analytics/link/:id is 404 for a link the caller does not own', async () => {
    const { token: otherToken, user: other } = await createTestUser();
    const res = await request(app).get(`/api/analytics/link/${link._id}`).set(authHeader(otherToken));
    assert.strictEqual(res.status, 404);
    await mongoose.model('User').deleteOne({ _id: other._id });
  });

  it('GET /api/analytics/summary/all aggregates across the user links', async () => {
    const res = await request(app).get('/api/analytics/summary/all').set(authHeader(token));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.summary.totalClicks, 2);
    assert.strictEqual(res.body.summary.totalLinks, 1);
  });

  it('GET /api/analytics/export streams CSV with referrer and UTM values, formula-escaped', async () => {
    const res = await request(app)
      .get('/api/analytics/export')
      .query({ linkId: String(link._id) })
      .set(authHeader(token));

    assert.strictEqual(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    const lines = res.text.trim().split('\n');
    assert.strictEqual(lines.length, 3, 'header + 2 events');
    assert.match(res.text, /"news\.ycombinator\.com"/);
    assert.match(res.text, /"hn"/);
    assert.match(res.text, /"'=HYPERLINK\(""http:\/\/evil""\)"/, 'formula cell is prefixed and quotes escaped');
  });
});
