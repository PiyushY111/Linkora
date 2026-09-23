import { describe, it, afterAll } from 'vitest';
import assert from 'node:assert';
import { env } from '../../src/config/env.js';
import { getRedis, closeRedis } from '../../src/services/cacheService.js';

/**
 * Runs after every other suite (vitest project `redis-hygiene`, groupOrder
 * 1) against the dedicated test Redis database, and inspects every key the
 * run left behind. The only keys allowed to live without a TTL are the
 * streams, which are bounded by XADD MAXLEN ~ instead (and carry the
 * consumer group inside them).
 */

// MAXLEN ~ trims whole macro-nodes (100 entries by default), so a stream can
// sit a little above its cap.
const APPROXIMATE_TRIM_SLACK = 100;
const CAPPED_STREAMS = {
  [env.CLICK_STREAM_KEY]: env.CLICK_STREAM_MAXLEN,
  [env.WEBHOOK_DLQ_STREAM_KEY]: env.WEBHOOK_DLQ_STREAM_MAXLEN,
};

// Key families the integration suites are known to leave behind. Asserting
// they were seen keeps this test from passing vacuously on an empty
// database. (Single-use keys such as sso:state: and link:unlock: are
// consumed with GETDEL by the suites that create them, so they don't
// survive to be scanned; their TTLs are set where they're written.)
const EXPECTED_FAMILIES = [
  'link:meta:',
  'link:usage:',
  'ratelimit:',
  'refresh:family:',
  'hll:visitors:',
  env.CLICK_STREAM_KEY,
];

async function scanAll(redis) {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'COUNT', 1000);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== '0');
  return keys;
}

afterAll(async () => {
  await closeRedis();
});

describe('Redis key hygiene after the integration run', () => {
  it('every key has a TTL, except the capped streams', async () => {
    const redis = getRedis();
    const keys = await scanAll(redis);

    const offenders = [];
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      if (ttl > 0 || ttl === -2) continue; // -2: expired between SCAN and TTL
      const type = await redis.type(key);
      if (type === 'stream' && key in CAPPED_STREAMS) {
        const length = await redis.xlen(key);
        assert.ok(length <= CAPPED_STREAMS[key] + APPROXIMATE_TRIM_SLACK, `${key} exceeds its MAXLEN`);
        continue;
      }
      offenders.push(`${key} (${type})`);
    }

    assert.deepStrictEqual(offenders, [], `keys without a TTL: ${offenders.join(', ')}`);

    const missing = EXPECTED_FAMILIES.filter((prefix) => !keys.some((k) => k.startsWith(prefix)));
    assert.deepStrictEqual(missing, [], `the integration run never created: ${missing.join(', ')}`);
  });
});
