import { describe, it, afterEach, afterAll } from 'vitest';
import assert from 'node:assert';
import { env } from '../../src/config/env.js';
import {
  getLinkMeta,
  setLinkMeta,
  getCacheRedis,
  linkMetaKey,
  xfetchLockKey,
  closeRedis,
} from '../../src/services/cacheService.js';

// Runs getLinkMeta() against the test Redis database. XFetch fires when
// delta * -ln(rand) >= remainingTtl; rand is floored at 0.0001, so with
// delta = 25ms the left side never exceeds ~230ms. That makes both cases
// deterministic: a fresh entry (an hour left) can never trigger, and an
// entry with 0ms left always does, leaving the lock as the only thing that
// decides how many callers recompute.
const DELTA_MS = 25;
const HERD_SIZE = 50;

const SHORT_CODE = 'xfetch-test-link';

const META = {
  originalUrl: 'https://example.com/xfetch',
  isActive: true,
  expiryDate: 0,
  passwordHash: '',
  linkId: 'xfetch-link-id',
  userId: 'xfetch-user-id',
  maxClicks: 0,
  routingType: 'direct',
  computeDelta: DELTA_MS,
};

async function readHerd(size) {
  return Promise.all(Array.from({ length: size }, () => getLinkMeta(SHORT_CODE)));
}

afterEach(async () => {
  await getCacheRedis().del(linkMetaKey(SHORT_CODE), xfetchLockKey(SHORT_CODE));
});

afterAll(async () => {
  await closeRedis();
});

describe('getLinkMeta XFetch early recompute', () => {
  it('never flags a fresh entry for early recompute', async () => {
    await setLinkMeta(SHORT_CODE, META);

    const results = await readHerd(HERD_SIZE);

    assert.ok(results.every((r) => r.status === 'hit'));
    assert.strictEqual(results.filter((r) => r.shouldRecomputeEarly).length, 0);
    assert.strictEqual(await getCacheRedis().exists(xfetchLockKey(SHORT_CODE)), 0);
  });

  it('lets exactly one concurrent caller recompute a near-expiry entry', async () => {
    await setLinkMeta(SHORT_CODE, {
      ...META,
      cachedAt: Date.now() - env.REDIS_CACHE_TTL_SECONDS * 1000,
    });

    const results = await readHerd(HERD_SIZE);

    assert.ok(results.every((r) => r.status === 'hit'));
    assert.ok(results.every((r) => r.meta.originalUrl === META.originalUrl));
    assert.strictEqual(results.filter((r) => r.shouldRecomputeEarly).length, 1);

    const lockTtlMs = await getCacheRedis().pttl(xfetchLockKey(SHORT_CODE));
    assert.ok(lockTtlMs > 0 && lockTtlMs <= 5000, `unexpected lock PTTL ${lockTtlMs}`);
  });

  it('does not hand out a second recompute while the lock is held', async () => {
    await setLinkMeta(SHORT_CODE, {
      ...META,
      cachedAt: Date.now() - env.REDIS_CACHE_TTL_SECONDS * 1000,
    });

    const first = await readHerd(HERD_SIZE);
    const second = await readHerd(HERD_SIZE);

    assert.strictEqual(first.filter((r) => r.shouldRecomputeEarly).length, 1);
    assert.strictEqual(second.filter((r) => r.shouldRecomputeEarly).length, 0);
  });
});
