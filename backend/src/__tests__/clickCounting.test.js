import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, createTestUser } from './testUtils.js';
import Link from '../models/Link.js';
import ClickEvent from '../models/ClickEvent.js';
import { env } from '../config/env.js';
import { redis, cacheRedis } from '../services/cacheService.js';
import { applyClickCounts, processBatch, APPLIED_CLICK_ID_WINDOW } from '../consumers/clickConsumer.js';

let user;
let originalClickHouseEnabled;

beforeAll(async () => {
  await connectTestDb();
  ({ user } = await createTestUser());
  // processBatch writes to ClickHouse first; this suite is about the Mongo
  // counter, so it must not depend on a ClickHouse server being up.
  originalClickHouseEnabled = env.CLICKHOUSE_ENABLED;
  env.CLICKHOUSE_ENABLED = false;
});

afterAll(async () => {
  env.CLICKHOUSE_ENABLED = originalClickHouseEnabled;
  await ClickEvent.deleteMany({ user: user._id });
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await redis.quit();
  await cacheRedis.quit();
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
    const entries = [streamEntry('4-0', base), streamEntry('4-1', base)];

    await processBatch(entries);
    assert.strictEqual(await clicksOf(link._id), 2);

    await processBatch(entries);
    assert.strictEqual(await clicksOf(link._id), 2);

    const refreshed = await Link.findById(link._id).lean();
    assert.ok(refreshed.lastAccessedAt instanceof Date);
  });
});
