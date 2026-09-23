import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import ClickEvent from '../../src/models/ClickEvent.js';
import ProcessedEvent, { PROCESSED_EVENT_TTL_SECONDS } from '../../src/models/ProcessedEvent.js';
import { LinkStatsHourly, LinkStatsDaily } from '../../src/models/LinkStats.js';
import { env } from '../../src/config/env.js';
import { redis, cacheRedis } from '../../src/services/cacheService.js';
import { getAnalyticsRepository } from '../../src/repositories/analytics/analyticsRepository.js';
import { selectRollupGranularity } from '../../src/repositories/analytics/mongoAnalyticsReader.js';
import { hourBucket, dayBucket } from '../../src/repositories/analytics/mongoAnalyticsWriter.js';
import { DIMENSIONS, OTHER_KEY, encodeKey } from '../../src/repositories/analytics/rollupDimensions.js';

const repo = getAnalyticsRepository();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let user;
let token;
let seq = 0;

async function createLink() {
  seq += 1;
  const shortCode = `ro${Date.now().toString(36)}${seq}`;
  return Link.create({
    user: user._id,
    originalUrl: 'https://example.com/rollups',
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
  });
}

function event(link, overrides = {}) {
  seq += 1;
  return {
    eventId: `${Date.now()}-${seq}`,
    linkId: String(link._id),
    userId: String(user._id),
    shortCode: link.shortCode,
    timestamp: new Date(),
    ipHash: `ip-${seq}`,
    referrerDomain: '',
    device: 'desktop',
    browser: 'Chrome',
    os: 'macOS',
    country: 'US',
    city: 'Austin',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    variantId: null,
    variantName: null,
    isBot: false,
    botName: null,
    ...overrides,
  };
}

// Deterministic PRNG so the seeded dataset is the same on every run.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

async function rollupDocs(Model, linkId) {
  return Model.collection.find({ linkId: new mongoose.Types.ObjectId(String(linkId)) }).toArray();
}

beforeAll(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser());
  await repo.ensureReady();
});

afterAll(async () => {
  await repo.deleteAnalytics({ userId: String(user._id) });
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await redis.quit();
  await cacheRedis.quit();
});

describe('analytics rollups: idempotency', () => {
  it('an event recorded twice counts once in raw events, both rollups and Link.clicks', async () => {
    const link = await createLink();
    const e = event(link);

    const first = await repo.recordClicks([e]);
    const second = await repo.recordClicks([e]);

    assert.strictEqual(first.applied.length, 1);
    assert.strictEqual(second.applied.length, 0, 'a done event is skipped outright');
    assert.strictEqual(await ClickEvent.collection.countDocuments({ eventId: e.eventId }), 1);
    const [hourly] = await rollupDocs(LinkStatsHourly, link._id);
    const [daily] = await rollupDocs(LinkStatsDaily, link._id);
    assert.strictEqual(hourly.total, 1);
    assert.strictEqual(daily.total, 1);
    assert.strictEqual((await Link.findById(link._id).lean()).clicks, 1);
  });

  it('resuming an interrupted batch applies only what the first attempt did not', async () => {
    const link = await createLink();
    const done = event(link);
    const interrupted = event(link);
    await repo.recordClicks([done, interrupted]);

    // Simulate a crash after the raw write and rollups but before `done`.
    await ProcessedEvent.collection.updateOne({ _id: interrupted.eventId }, { $set: { state: 'pending' } });
    const fresh = event(link);
    const { applied } = await repo.recordClicks([done, interrupted, fresh]);

    assert.deepStrictEqual(applied.map((e) => e.eventId).sort(), [interrupted.eventId, fresh.eventId].sort());
    assert.strictEqual(await ClickEvent.collection.countDocuments({ 'meta.linkId': link._id }), 3);
    const [daily] = await rollupDocs(LinkStatsDaily, link._id);
    assert.strictEqual(daily.total, 3);
    assert.strictEqual((await Link.findById(link._id).lean()).clicks, 3);
    assert.strictEqual(await ProcessedEvent.collection.countDocuments({ _id: interrupted.eventId, state: 'done' }), 1);
  });
});

describe('analytics rollups: consistency with raw events', () => {
  it('rollups match the raw events of a seeded dataset', async () => {
    const rand = mulberry32(42);
    const links = [await createLink(), await createLink()];
    const now = Date.now();
    const events = Array.from({ length: 400 }, () =>
      event(pick(rand, links), {
        timestamp: new Date(now - Math.floor(rand() * 3 * DAY)),
        ipHash: `ip-${Math.floor(rand() * 60)}`,
        country: pick(rand, ['US', 'DE', 'IN', '']),
        device: pick(rand, ['desktop', 'mobile', 'tablet']),
        referrerDomain: pick(rand, ['', 'news.ycombinator.com', 't.co', 'localhost:3000']),
        utmSource: pick(rand, ['', 'newsletter', 'x']),
        isBot: rand() < 0.2,
      })
    );
    for (let i = 0; i < events.length; i += 100) {
      await repo.recordClicks(events.slice(i, i + 100));
    }

    for (const link of links) {
      const raw = events.filter((e) => e.linkId === String(link._id));
      const daily = await rollupDocs(LinkStatsDaily, link._id);
      const hourly = await rollupDocs(LinkStatsHourly, link._id);

      const sum = (docs, f) => docs.reduce((n, d) => n + f(d), 0);
      assert.strictEqual(sum(daily, (d) => d.total), raw.length);
      assert.strictEqual(sum(hourly, (d) => d.total), raw.length);
      assert.strictEqual(sum(daily, (d) => d.bot), raw.filter((e) => e.isBot).length);

      // Per-bucket totals line up with raw events bucketed the same way.
      for (const doc of hourly) {
        const inBucket = raw.filter((e) => hourBucket(e.timestamp).getTime() === doc.bucket.getTime());
        assert.strictEqual(doc.total, inBucket.length);
      }

      // Dimension maps, for all clicks (a) and humans only (h).
      for (const country of ['US', 'DE', 'IN']) {
        const key = encodeKey(country);
        assert.strictEqual(
          sum(daily, (d) => d.dims?.country?.[key]?.a || 0),
          raw.filter((e) => e.country === country).length
        );
        assert.strictEqual(
          sum(daily, (d) => d.dims?.country?.[key]?.h || 0),
          raw.filter((e) => e.country === country && !e.isBot).length
        );
      }
      const direct = raw.filter((e) => !e.referrerDomain || e.referrerDomain.startsWith('localhost')).length;
      assert.strictEqual(sum(daily, (d) => d.dims?.referrer?.Direct?.a || 0), direct);
      assert.strictEqual(
        sum(daily, (d) => d.dims?.referrer?.[encodeKey('news.ycombinator.com')]?.a || 0),
        raw.filter((e) => e.referrerDomain === 'news.ycombinator.com').length
      );

      // Unique visitors per day: HyperLogLog, exact enough at this size.
      for (const doc of daily) {
        const exact = new Set(
          raw.filter((e) => dayBucket(e.timestamp).getTime() === doc.bucket.getTime()).map((e) => e.ipHash)
        ).size;
        assert.ok(Math.abs(doc.unique - exact) <= Math.max(1, exact * 0.02), `unique ${doc.unique} ~ ${exact}`);
      }
    }
  });

  it('caps each dimension map and folds the overflow into "other"', async () => {
    const link = await createLink();
    const cap = DIMENSIONS.referrer.cap;
    const events = Array.from({ length: cap + 15 }, (_, i) => event(link, { referrerDomain: `site${i}.example` }));
    await repo.recordClicks(events);

    const [daily] = await rollupDocs(LinkStatsDaily, link._id);
    const keys = Object.keys(daily.dims.referrer);
    assert.strictEqual(keys.filter((k) => k !== OTHER_KEY).length, cap);
    assert.strictEqual(daily.dims.referrer[OTHER_KEY].a, 15);
    assert.strictEqual(daily.total, cap + 15);
  });
});

describe('analytics rollups: reads', () => {
  it('selects hourly rollups for ranges up to 48h inside retention, daily otherwise', () => {
    const now = new Date();
    const ago = (ms) => new Date(now.getTime() - ms);
    assert.strictEqual(selectRollupGranularity(ago(DAY), now, now), 'hourly');
    assert.strictEqual(selectRollupGranularity(ago(48 * HOUR), now, now), 'hourly');
    assert.strictEqual(selectRollupGranularity(ago(48 * HOUR + 1), now, now), 'daily');
    assert.strictEqual(selectRollupGranularity(ago(7 * DAY), now, now), 'daily');
    const old = ago((env.CLICK_EVENT_RETENTION_DAYS + 1) * DAY);
    assert.strictEqual(selectRollupGranularity(old, new Date(old.getTime() + DAY), now), 'daily');
  });

  it('the endpoint reads hourly rollups for 24h and daily rollups for 7d', async () => {
    const link = await createLink();
    const now = new Date();
    // Deliberately inconsistent totals, so the response shows which collection was read.
    await LinkStatsHourly.collection.insertOne({ linkId: link._id, userId: user._id, bucket: hourBucket(now), total: 7, human: 7, bot: 0 });
    await LinkStatsDaily.collection.insertOne({ linkId: link._id, userId: user._id, bucket: dayBucket(now), total: 3, human: 3, bot: 0 });

    const hourlyRes = await request(app).get(`/api/analytics/link/${link._id}`).query({ timeRange: '24h' }).set(authHeader(token));
    const dailyRes = await request(app).get(`/api/analytics/link/${link._id}`).query({ timeRange: '7d' }).set(authHeader(token));

    assert.strictEqual(hourlyRes.body.analytics.totalClicks, 7);
    assert.strictEqual(dailyRes.body.analytics.totalClicks, 3);
  });

  it('excludeBots reports human counts and still shows the bot breakdown', async () => {
    const link = await createLink();
    await repo.recordClicks([event(link), event(link, { isBot: true, botName: 'Googlebot' }), event(link)]);

    const res = await request(app)
      .get(`/api/analytics/link/${link._id}`)
      .query({ excludeBots: 'true' })
      .set(authHeader(token));

    assert.strictEqual(res.body.analytics.totalClicks, 2);
    assert.deepStrictEqual(
      [res.body.analytics.botBreakdown.humanClicks, res.body.analytics.botBreakdown.botClicks],
      [2, 1]
    );
    assert.strictEqual(res.body.analytics.topCountries[0].clicks, 2);
  });

  it('deleting a link removes its raw events and rollups', async () => {
    const link = await createLink();
    await repo.recordClicks([event(link)]);

    const res = await request(app).delete(`/api/links/${link._id}`).set(authHeader(token));

    assert.strictEqual(res.status, 200);
    assert.strictEqual(await ClickEvent.collection.countDocuments({ 'meta.linkId': link._id }), 0);
    assert.strictEqual((await rollupDocs(LinkStatsHourly, link._id)).length, 0);
    assert.strictEqual((await rollupDocs(LinkStatsDaily, link._id)).length, 0);
  });
});

describe('analytics collections: retention and indexes', () => {
  it('click_events is a time-series collection with the configured retention', async () => {
    const [info] = await mongoose.connection.db.listCollections({ name: 'click_events' }).toArray();
    assert.strictEqual(info.type, 'timeseries');
    assert.strictEqual(info.options.timeseries.timeField, 'timestamp');
    assert.strictEqual(info.options.timeseries.metaField, 'meta');
    assert.strictEqual(info.options.expireAfterSeconds, env.CLICK_EVENT_RETENTION_DAYS * 24 * 60 * 60);
  });

  it('processed_events and hourly rollups expire; rollups have a unique (linkId, bucket) index', async () => {
    const ttlOf = async (Model, key) => {
      const indexes = await Model.collection.indexes();
      return indexes.find((i) => JSON.stringify(i.key) === JSON.stringify(key));
    };
    assert.strictEqual((await ttlOf(ProcessedEvent, { createdAt: 1 })).expireAfterSeconds, PROCESSED_EVENT_TTL_SECONDS);
    assert.strictEqual(
      (await ttlOf(LinkStatsHourly, { bucket: 1 })).expireAfterSeconds,
      env.CLICK_EVENT_RETENTION_DAYS * 24 * 60 * 60
    );
    assert.strictEqual(await ttlOf(LinkStatsDaily, { bucket: 1 }), undefined, 'daily rollups are kept');
    assert.strictEqual((await ttlOf(LinkStatsHourly, { linkId: 1, bucket: 1 })).unique, true);
    assert.strictEqual((await ttlOf(LinkStatsDaily, { linkId: 1, bucket: 1 })).unique, true);
  });
});
