import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';

/**
 * WORKER_MODE=embedded: one process serves the redirect and runs the click
 * consumer, and a click flows all the way to the rollups without a separate
 * worker. Uses its own stream key so it can't consume other suites' clicks;
 * env is read at import time, so modules are imported after setting it.
 */
const STREAM_KEY = `stream:clicks:embedded-test:${process.pid}`;
process.env.CLICK_STREAM_KEY = STREAM_KEY;

let mods;
let started;
let user;
let link;

async function waitFor(check, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

beforeAll(async () => {
  const [{ startServer }, testUtils, { default: Link }, { LinkStatsDaily }, { default: ClickEvent }, mongoose, cache, repo] =
    await Promise.all([
      import('../../src/server.js'),
      import('../helpers/testUtils.js'),
      import('../../src/models/Link.js'),
      import('../../src/models/LinkStats.js'),
      import('../../src/models/ClickEvent.js'),
      import('mongoose'),
      import('../../src/services/cacheService.js'),
      import('../../src/repositories/analytics/analyticsRepository.js'),
    ]);
  mods = { Link, LinkStatsDaily, ClickEvent, mongoose: mongoose.default, cache, repo: repo.getAnalyticsRepository() };

  started = await startServer({ port: 0, workerMode: 'embedded', mongoUri: testUtils.testDbUri() });

  ({ user } = await testUtils.createTestUser());
  const shortCode = `em${Date.now().toString(36)}`;
  link = await Link.create({
    user: user._id,
    originalUrl: 'https://example.com/embedded',
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
  });
});

afterAll(async () => {
  // Normally already shut down by the last test; shutdown() is idempotent.
  if (mods.mongoose.connection.readyState !== 1) {
    await mods.mongoose.connect((await import('../helpers/testUtils.js')).testDbUri());
  }
  await mods.repo.deleteAnalytics({ userId: String(user._id) });
  await mods.Link.deleteMany({ user: user._id });
  await mods.mongoose.model('User').deleteOne({ _id: user._id });
  await mods.mongoose.disconnect();
  // This test's private stream isn't one of the capped streams the
  // redis-hygiene check allows, so remove it.
  await mods.cache.getRedis().del(STREAM_KEY);
  await mods.cache.closeRedis();
});

describe('WORKER_MODE=embedded', () => {
  it('a redirect is counted into the rollups and Link.clicks by the in-process consumer', async () => {
    const res = await fetch(`http://127.0.0.1:${started.port}/api/r/${link.shortCode}`, { redirect: 'manual' });
    assert.strictEqual(res.status, 307);
    assert.strictEqual(res.headers.get('location'), 'https://example.com/embedded');

    const daily = await waitFor(async () => {
      const [doc] = await mods.LinkStatsDaily.collection.find({ linkId: link._id }).toArray();
      return doc?.total === 1 ? doc : null;
    });

    assert.strictEqual(daily.human, 1);
    assert.strictEqual(await mods.ClickEvent.collection.countDocuments({ 'meta.linkId': link._id }), 1);
    assert.strictEqual((await mods.Link.findById(link._id).lean()).clicks, 1);
  });

  it('shutdown stops the consumer and the HTTP server and closes MongoDB and Redis', async () => {
    const shutdownStartedAt = Date.now();
    await started.shutdown();

    // The consumer was idle in a blocking read; stop() aborts it rather
    // than waiting out its BLOCK.
    assert.ok(Date.now() - shutdownStartedAt < 5000, 'shutdown did not wait out a blocking read');
    assert.strictEqual(started.server.listening, false);
    assert.strictEqual(mods.mongoose.connection.readyState, 0);
    await assert.rejects(
      fetch(`http://127.0.0.1:${started.port}/health/liveness`),
      'the port no longer accepts connections'
    );
  });
});
