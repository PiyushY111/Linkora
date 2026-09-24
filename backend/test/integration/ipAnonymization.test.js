import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import ClickEvent from '../../src/models/ClickEvent.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { processBatch } from '../../src/consumers/clickConsumer.js';
import { getAnalyticsRepository } from '../../src/repositories/analytics/analyticsRepository.js';
import { anonymizeIp } from '../../src/utils/ipPrivacy.js';

const runId = `anon${Date.now()}${crypto.randomInt(1e6)}`;
const users = [];

function streamEntry(id, fields) {
  return [id, Object.entries(fields).flatMap(([k, v]) => [k, String(v)])];
}

async function ownerWithLink({ anonymizeVisitorIps }) {
  const { user } = await createTestUser({ anonymizeVisitorIps });
  users.push(user);
  const shortCode = `an${Date.now().toString(36)}${users.length}`;
  const link = await Link.create({
    user: user._id,
    originalUrl: 'https://example.com/anon',
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
  });
  return { user, link };
}

function clickFrom(user, link, ip) {
  return {
    linkId: String(link._id),
    shortCode: link.shortCode,
    userId: String(user._id),
    ip,
    ua: 'Mozilla/5.0',
    referer: 'direct',
    timestamp: Date.now(),
  };
}

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  for (const user of users) {
    await getAnalyticsRepository().deleteAnalytics({ userId: String(user._id) });
    await Link.deleteMany({ user: user._id });
    await mongoose.model('User').deleteOne({ _id: user._id });
  }
  await disconnectTestDb();
  await closeRedis();
});

describe('anonymizeIp', () => {
  it.each([
    ['203.0.113.77', '203.0.113.0'],
    ['::ffff:203.0.113.77', '203.0.113.0'],
    ['2001:db8:abcd:1234:5678:9abc:def0:1234', '2001:db8:abcd::'],
    ['2001:db8::1', '2001:db8::'],
    ['::1', '::'],
    ['not-an-ip', ''],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    assert.strictEqual(anonymizeIp(input), expected);
  });
});

describe('visitor IP anonymisation in the click pipeline', () => {
  it('stores a masked IP when the link owner has anonymisation on', async () => {
    const { user, link } = await ownerWithLink({ anonymizeVisitorIps: true });
    await processBatch([streamEntry(`${runId}-1`, clickFrom(user, link, '198.51.100.23'))]);

    const stored = await ClickEvent.collection.findOne({ eventId: `${runId}-1` });
    assert.strictEqual(stored.ip, '198.51.100.0');
    assert.ok(!JSON.stringify(stored).includes('198.51.100.23'));
  });

  it('stores the full IP when the owner has anonymisation off', async () => {
    const { user, link } = await ownerWithLink({ anonymizeVisitorIps: false });
    await processBatch([streamEntry(`${runId}-2`, clickFrom(user, link, '198.51.100.24'))]);

    const stored = await ClickEvent.collection.findOne({ eventId: `${runId}-2` });
    assert.strictEqual(stored.ip, '198.51.100.24');
  });

  it('hashes the visitor IP with a server-side key, so the hash is not a plain SHA-256 of the IP', async () => {
    const { user, link } = await ownerWithLink({ anonymizeVisitorIps: true });
    await processBatch([
      streamEntry(`${runId}-3`, clickFrom(user, link, '198.51.100.25')),
      streamEntry(`${runId}-4`, clickFrom(user, link, '198.51.100.25')),
      streamEntry(`${runId}-5`, clickFrom(user, link, '198.51.100.26')),
    ]);

    const [a, b, c] = await Promise.all(
      [3, 4, 5].map((n) => ClickEvent.collection.findOne({ eventId: `${runId}-${n}` }))
    );
    const plainSha = crypto.createHash('sha256').update('198.51.100.25').digest('hex');
    assert.notStrictEqual(a.ipHash, plainSha);
    // Same visitor, same hash: unique-visitor counting still works.
    assert.strictEqual(a.ipHash, b.ipHash);
    // Two visitors in the same /24 stay distinct even though both mask to .0.
    assert.notStrictEqual(a.ipHash, c.ipHash);
  });
});
