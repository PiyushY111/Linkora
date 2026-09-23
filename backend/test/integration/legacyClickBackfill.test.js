import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import { LinkStatsDaily } from '../../src/models/LinkStats.js';
import ClickEvent from '../../src/models/ClickEvent.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { getAnalyticsRepository } from '../../src/repositories/analytics/analyticsRepository.js';
import { backfillLegacyClickEvents, LEGACY_COLLECTION } from '../../scripts/backfill-legacy-click-events.js';

let user;
let link;
let legacy;

beforeAll(async () => {
  await connectTestDb();
  ({ user } = await createTestUser());
  const shortCode = `lg${Date.now().toString(36)}`;
  link = await Link.create({
    user: user._id,
    originalUrl: 'https://example.com/legacy',
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
    clicks: 3,
  });
  legacy = mongoose.connection.db.collection(LEGACY_COLLECTION);
  await legacy.deleteMany({});
  const base = { link: link._id, user: user._id, shortCode, timestamp: new Date(), device: 'mobile', country: 'DE' };
  await legacy.insertMany([
    { ...base, ipHash: 'a', referer: 'https://t.co/abc' },
    { ...base, ipHash: 'b', referer: 'direct' },
    { ...base, ipHash: 'a', referer: 'direct', isBot: true },
  ]);
});

afterAll(async () => {
  await legacy.deleteMany({});
  await getAnalyticsRepository().deleteAnalytics({ userId: String(user._id) });
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('backfill-legacy-click-events', () => {
  it('replays legacy clicks into raw events and rollups once, without touching Link.clicks', async () => {
    const first = await backfillLegacyClickEvents();
    const second = await backfillLegacyClickEvents();

    assert.deepStrictEqual(first, { scanned: 3, applied: 3 });
    assert.deepStrictEqual(second, { scanned: 3, applied: 0 });
    assert.strictEqual(await ClickEvent.collection.countDocuments({ 'meta.linkId': link._id }), 3);

    const [daily] = await LinkStatsDaily.collection.find({ linkId: link._id }).toArray();
    assert.strictEqual(daily.total, 3);
    assert.strictEqual(daily.bot, 1);
    assert.strictEqual(daily.dims.referrer['t%2Eco'].a, 1);
    assert.strictEqual(daily.unique, 2);
    assert.strictEqual((await Link.findById(link._id).lean()).clicks, 3, 'Link.clicks already counted these');
  });
});
