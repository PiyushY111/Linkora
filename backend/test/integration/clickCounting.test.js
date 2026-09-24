import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { processBatch } from '../../src/consumers/clickConsumer.js';
import { getAnalyticsRepository } from '../../src/repositories/analytics/analyticsRepository.js';
import { applyClickCounts, APPLIED_ID_WINDOW as APPLIED_CLICK_ID_WINDOW } from '../../src/repositories/analytics/mongoAnalyticsWriter.js';

// Stream entry IDs are unique in production; processed_events outlives a
// test run, so reusing fixed IDs across runs would read as redeliveries.
const runId = Date.now();

let user;

beforeAll(async () => {
  await connectTestDb();
  ({ user } = await createTestUser());
});

afterAll(async () => {
  await getAnalyticsRepository().deleteAnalytics({ userId: String(user._id) });
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

let codeSeq = 0;
async function createLink() {
  codeSeq += 1;
  const shortCode = `cc${Date.now().toString(36)}${codeSeq}`;
  return Link.create({
    user: user._id,
    originalUrl: 'https://example.com/counted',
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
  });
}

async function clicksOf(linkId) {
  return (await Link.findById(linkId).lean()).clicks;
}

function streamEntry(id, fields) {
  return [id, Object.entries(fields).flatMap(([k, v]) => [k, String(v)])];
}

describe('click counting (stream consumer -> Link.clicks)', () => {
  it('counts each stream entry once, even when redelivered in a different batch grouping', async () => {
    const link = await createLink();
    const linkId = String(link._id);
    const at = new Date();
    const click = (id) => ({ id, linkId, timestamp: at });

    await applyClickCounts([click('1-0'), click('1-1'), click('1-2')]);
    assert.strictEqual(await clicksOf(linkId), 3);

    // Exact replay of the same batch (e.g. XACK failed after the write).
    await applyClickCounts([click('1-0'), click('1-1'), click('1-2')]);
    assert.strictEqual(await clicksOf(linkId), 3);

    // XAUTOCLAIM can regroup entries: two already counted plus one new.
    await applyClickCounts([click('1-1'), click('1-2'), click('1-3')]);
    assert.strictEqual(await clicksOf(linkId), 4);
  });

  it('keeps the dedup window bounded and never exposes it by default', async () => {
    const link = await createLink();
    const at = new Date();
    const clicks = Array.from({ length: APPLIED_CLICK_ID_WINDOW + 5 }, (_, i) => ({
      id: `2-${i}`,
      linkId: String(link._id),
      timestamp: at,
    }));

    await applyClickCounts(clicks);

    const withWindow = await Link.findById(link._id).select('+appliedClickIds').lean();
    assert.strictEqual(withWindow.clicks, APPLIED_CLICK_ID_WINDOW + 5);
    assert.strictEqual(withWindow.appliedClickIds.length, APPLIED_CLICK_ID_WINDOW);
    // Unordered bulk ops may apply in any order within one batch, so only
    // the size and uniqueness of the window are guaranteed, not which 5 fell out.
    assert.strictEqual(new Set(withWindow.appliedClickIds).size, APPLIED_CLICK_ID_WINDOW);

    const plain = await Link.findById(link._id).lean();
    assert.strictEqual(plain.appliedClickIds, undefined);
  });

  it('skips events with an invalid linkId without failing the rest of the batch', async () => {
    const link = await createLink();
    const at = new Date();

    await applyClickCounts([
      { id: '3-0', linkId: 'not-an-object-id', timestamp: at },
      { id: '3-1', linkId: String(link._id), timestamp: at },
    ]);

    assert.strictEqual(await clicksOf(link._id), 1);
  });

  it('processBatch increments Link.clicks and is idempotent when the batch is reprocessed', async () => {
    const link = await createLink();
    const base = {
      linkId: String(link._id),
      shortCode: link.shortCode,
      userId: String(user._id),
      ip: '127.0.0.1',
      ua: 'Mozilla/5.0',
      referer: 'direct',
      timestamp: Date.now(),
    };
    const entries = [streamEntry(`${runId}-40`, base), streamEntry(`${runId}-41`, base)];

    await processBatch(entries);
    assert.strictEqual(await clicksOf(link._id), 2);

    await processBatch(entries);
    assert.strictEqual(await clicksOf(link._id), 2);

    const refreshed = await Link.findById(link._id).lean();
    assert.ok(refreshed.lastAccessedAt instanceof Date);
  });
});

describe('processBatch with an event that cannot be recorded', () => {
  it('acknowledges an event with an invalid linkId instead of redelivering it forever', async () => {
    const acks = [];
    const stubRedis = {
      async xack(...args) {
        acks.push(...args.slice(2));
        return 1;
      },
    };
    const id = `${runId}-900`;
    await processBatch(
      [streamEntry(id, { linkId: 'not-an-object-id', shortCode: 'x', userId: String(user._id), ip: '203.0.113.9', ua: '', referer: 'direct', timestamp: Date.now() })],
      { redis: stubRedis }
    );
    assert.deepStrictEqual(acks, [id]);
  });
});
