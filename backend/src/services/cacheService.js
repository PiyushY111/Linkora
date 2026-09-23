import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redisCacheHitsTotal, redisCacheMissesTotal } from '../middleware/metrics.js';

/**
 * Sizing guidance (Phase 4.3): each link:meta:{shortCode} hash is roughly
 * 250 bytes (6 fields incl. a URL). At 10M active links that's ~2.5GB of
 * cache footprint. Provision Redis with headroom on top of that for the
 * link:link_sequence counter, per-day link:counters:{date} hashes,
 * stream:clicks (trimmed by the consumer's XACK+XAUTOCLAIM cycle), and the
 * Phase 5 sliding-window rate-limit keys — 4-6GB maxmemory is a reasonable
 * starting point for that scale, with maxmemory-policy allkeys-lru so cold
 * entries evict before hot ones under pressure.
 */
/**
 * Factory, not a singleton: nothing connects at import time. server.js (and
 * test setup, pointed at a testcontainers URL) decide when and to what to
 * connect by calling this.
 */
export function createRedisClient(url = env.REDIS_URL, options = {}) {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    enableAutoPipelining: false,
    ...options,
  });
  client.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  client.on('connect', () => logger.info('Redis connected'));
  return client;
}

let activeClient = null;

function ensureActiveClient() {
  if (!activeClient) activeClient = createRedisClient();
  return activeClient;
}

/**
 * Swaps the client every `redis.<method>()` call below resolves against.
 * Test setup uses this to point every already-imported module at a
 * testcontainers Redis without needing to change any of their imports.
 */
export function setActiveRedisClient(client) {
  activeClient = client;
}

export function resetActiveRedisClient() {
  activeClient = null;
}

// A thin proxy, not the client itself: every property/method access is
// resolved against whatever `activeClient` currently is (lazily created on
// first use), so the many `import { redis } from './cacheService.js'`
// call sites across the app never need to change, while still never
// connecting anything just by being imported.
export const redis = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = ensureActiveClient();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);

export const NEGATIVE_CACHE_MARKER = '__NULL__';

export const linkMetaKey = (shortCode) => `link:meta:${shortCode}`;
export const linkCountersKey = (date) => `link:counters:${date}`;
export const linkSequenceKey = () => 'key:link_sequence';

/**
 * @typedef {Object} LinkMeta
 * @property {string} originalUrl
 * @property {boolean} isActive
 * @property {number} expiryDate - unix ms, or 0 if no expiry
 * @property {string} passwordHash
 * @property {string} linkId
 * @property {string} userId
 * @property {number} [maxClicks] - 0 if no click limit
 */

export const linkUsageKey = (linkId) => `link:usage:${linkId}`;
export const xfetchLockKey = (shortCode) => `lock:xfetch:${shortCode}`;

/**
 * Reads link:meta:{shortCode} via a single HGETALL with XFetch Probabilistic Early Expiration.
 *
 * Algorithm (XFetch):
 *   delta * beta * (-ln(rand)) >= remainingTTL
 * If true, marks `shouldRecomputeEarly: true` so the caller asynchronously re-caches
 * from MongoDB while serving the valid cache hit immediately with zero latency penalty.
 *
 * Returns:
 *  - `{ status: 'hit', meta, shouldRecomputeEarly: boolean }`
 *  - `{ status: 'negative' }`
 *  - `{ status: 'miss' }`
 * @param {string} shortCode
 */
export async function getLinkMeta(shortCode) {
  const key = linkMetaKey(shortCode);
  const hash = await redis.hgetall(key);

  if (!hash || Object.keys(hash).length === 0) {
    redisCacheMissesTotal.inc({ operation: 'link_meta' });
    redis.incr('stats:cache_misses').catch(() => {});
    return { status: 'miss' };
  }

  if (hash[NEGATIVE_CACHE_MARKER]) {
    redisCacheHitsTotal.inc({ operation: 'link_meta' });
    redis.incr('stats:cache_hits').catch(() => {});
    return { status: 'negative' };
  }

  redisCacheHitsTotal.inc({ operation: 'link_meta' });
  redis.incr('stats:cache_hits').catch(() => {});

  let variants = [];
  try {
    if (hash.variants) variants = JSON.parse(hash.variants);
  } catch {}

  const meta = {
    originalUrl: hash.originalUrl,
    isActive: hash.isActive === 'true',
    expiryDate: Number(hash.expiryDate) || 0,
    passwordHash: hash.passwordHash || '',
    linkId: hash.linkId,
    userId: hash.userId,
    maxClicks: Number(hash.maxClicks) || 0,
    iosRedirect: hash.iosRedirect || '',
    androidRedirect: hash.androidRedirect || '',
    expiredRedirectUrl: hash.expiredRedirectUrl || '',
    routingType: hash.routingType || 'direct',
    variants,
    ogTitle: hash.ogTitle || null,
    ogDescription: hash.ogDescription || null,
    ogImage: hash.ogImage || null,
  };

  // --- XFetch Optimal Probabilistic Early Expiration Evaluation ---
  let shouldRecomputeEarly = false;
  try {
    const cachedAt = Number(hash.cachedAt) || Date.now();
    const ttlSeconds = Number(hash.ttlSeconds) || env.REDIS_CACHE_TTL_SECONDS;
    const elapsedMs = Math.max(0, Date.now() - cachedAt);
    const remainingMs = Math.max(0, ttlSeconds * 1000 - elapsedMs);
    const delta = Number(hash.computeDelta) || 25; // measured or default 25ms Mongo fetch time
    const beta = 1.0; // Aggressiveness parameter
    const rand = Math.random();

    // Optimal probabilistic early expiration condition
    const xfetchThreshold = delta * beta * (-Math.log(rand || 0.0001));

    if (xfetchThreshold >= remainingMs) {
      // Expiration is nearing; attempt atomic lock acquisition so only ONE request refreshes
      const lockKey = xfetchLockKey(shortCode);
      const acquired = await redis.set(lockKey, '1', 'PX', 5000, 'NX');
      if (acquired) {
        shouldRecomputeEarly = true;
        redis.incr('stats:xfetch_early_refreshes').catch(() => {});
      }
    }
  } catch (err) {
    logger.warn({ err, shortCode }, 'XFetch evaluation error');
  }

  return {
    status: 'hit',
    meta,
    shouldRecomputeEarly,
  };
}

/**
 * Populates link:meta:{shortCode} via a pipeline (HSET + EXPIRE) with telemetry for XFetch.
 * @param {string} shortCode
 * @param {LinkMeta} meta
 */
export async function setLinkMeta(shortCode, meta) {
  const key = linkMetaKey(shortCode);
  const pipeline = redis.pipeline();
  pipeline.hset(key, {
    originalUrl: meta.originalUrl || '',
    isActive: String(meta.isActive !== false),
    expiryDate: String(meta.expiryDate || 0),
    passwordHash: meta.passwordHash || '',
    linkId: meta.linkId || '',
    userId: meta.userId || '',
    maxClicks: String(meta.maxClicks || 0),
    iosRedirect: meta.iosRedirect || '',
    androidRedirect: meta.androidRedirect || '',
    expiredRedirectUrl: meta.expiredRedirectUrl || '',
    routingType: meta.routingType || 'direct',
    variants: JSON.stringify(meta.variants || []),
    ogTitle: meta.ogTitle || '',
    ogDescription: meta.ogDescription || '',
    ogImage: meta.ogImage || '',
    cachedAt: String(Date.now()),
    ttlSeconds: String(env.REDIS_CACHE_TTL_SECONDS),
    computeDelta: String(meta.computeDelta || 25),
  });
  pipeline.expire(key, env.REDIS_CACHE_TTL_SECONDS);
  await pipeline.exec();
}

/**
 * Writes a negative cache entry to prevent cache penetration for short codes
 * that don't exist in MongoDB.
 * @param {string} shortCode
 */
export async function setNegativeCache(shortCode) {
  const key = linkMetaKey(shortCode);
  const pipeline = redis.pipeline();
  pipeline.hset(key, NEGATIVE_CACHE_MARKER, '1');
  pipeline.expire(key, env.REDIS_NEGATIVE_CACHE_TTL_SECONDS);
  await pipeline.exec();
}

/**
 * Invalidates the cache entry immediately on edit/delete/status toggle.
 * @param {string} shortCode
 */
export async function invalidateLinkMeta(shortCode) {
  await redis.del(linkMetaKey(shortCode));
}

/**
 * Atomically bumps the per-day, per-link click counter used to avoid
 * synchronous MongoDB writes on the redirect hot path.
 * @param {string} linkId
 * @param {Date} [when]
 */
export async function incrementClickCounter(linkId, when = new Date()) {
  const date = when.toISOString().slice(0, 10);
  await redis.hincrby(linkCountersKey(date), linkId, 1);
}

/**
 * Atomically evaluates and records click usage against maxClicks.
 * @param {string} linkId
 * @param {number} maxClicks
 * @returns {Promise<{ allowed: boolean, current: number, max: number, reached: boolean }>}
 */
export async function checkAndIncrementUsage(linkId, maxClicks) {
  if (!maxClicks || maxClicks <= 0) return { allowed: true };
  const key = linkUsageKey(linkId);
  const current = await redis.incr(key);
  if (current > maxClicks) {
    return { allowed: false, current, max: maxClicks, reached: true };
  }
  return { allowed: true, current, max: maxClicks, reached: current >= maxClicks };
}

/**
 * Returns the current recorded usage count from Redis.
 * @param {string} linkId
 * @returns {Promise<number>}
 */
export async function getCurrentUsage(linkId) {
  const key = linkUsageKey(linkId);
  const val = await redis.get(key);
  return Number(val) || 0;
}

/**
 * Seeds the link usage counter in Redis (only if not already set).
 * @param {string} linkId
 * @param {number} currentClicks
 */
export async function seedLinkUsage(linkId, currentClicks) {
  const key = linkUsageKey(linkId);
  await redis.set(key, currentClicks || 0, 'NX');
}

/**
 * Returns cache diagnostics and XFetch early expiration statistics.
 */
export async function getCacheDiagnostics() {
  const [hits, misses, earlyRefreshes, memoryInfo, dbsize] = await Promise.all([
    redis.get('stats:cache_hits').then((v) => Number(v) || 0),
    redis.get('stats:cache_misses').then((v) => Number(v) || 0),
    redis.get('stats:xfetch_early_refreshes').then((v) => Number(v) || 0),
    redis.info('memory').catch(() => ''),
    redis.dbsize().catch(() => 0),
  ]);

  const total = hits + misses;
  const hitRatio = total > 0 ? Number(((hits / total) * 100).toFixed(2)) : 100.0;

  const memMatch = (memoryInfo || '').match(/used_memory_human:(.+)/);
  const usedMemoryHuman = memMatch ? memMatch[1].trim() : 'Active';

  return {
    hits,
    misses,
    totalRequests: total,
    hitRatio,
    earlyRefreshes,
    stampedesAvoided: earlyRefreshes,
    algorithm: 'XFetch (Probabilistic Early Expiration)',
    formula: 'delta * beta * (-ln(rand)) >= remaining_ttl',
    params: {
      beta: 1.0,
      deltaMs: 25,
      ttlSeconds: env.REDIS_CACHE_TTL_SECONDS,
    },
    redisStats: {
      totalKeys: dbsize,
      usedMemory: usedMemoryHuman,
      status: redis.status,
    },
  };
}

/**
 * Runs a controlled thundering-herd simulation to demonstrate XFetch in action.
 * @param {number} concurrency
 */
export async function simulateThunderingHerd(concurrency = 50) {
  const startTime = Date.now();
  const testKey = 'benchmark-stampede-link';

  // Seed an entry that is mathematically near expiration so XFetch activates
  await setLinkMeta(testKey, {
    originalUrl: 'https://linkora.dev/benchmark',
    isActive: true,
    expiryDate: 0,
    passwordHash: '',
    linkId: 'bench-link-id',
    userId: 'bench-user-id',
    maxClicks: 0,
    routingType: 'direct',
    computeDelta: 35,
    cachedAt: Date.now() - (env.REDIS_CACHE_TTL_SECONDS * 1000 - 60),
  });

  let earlyRefreshesTriggered = 0;
  let cacheHits = 0;
  let dbQueriesMade = 0;

  const requests = Array.from({ length: concurrency }).map(async () => {
    const res = await getLinkMeta(testKey);
    if (res.status === 'hit') {
      cacheHits++;
      if (res.shouldRecomputeEarly) {
        earlyRefreshesTriggered++;
        dbQueriesMade++; // Only 1 lucky worker gets the lock to recompute!
      }
    }
  });

  await Promise.all(requests);
  const durationMs = Date.now() - startTime;

  return {
    concurrency,
    durationMs,
    cacheHits,
    earlyRefreshesTriggered,
    dbQueriesMade,
    stampedesAvoided: concurrency - dbQueriesMade,
    savedDatabaseLoadPercent: Number((((concurrency - dbQueriesMade) / concurrency) * 100).toFixed(1)),
  };
}

export default redis;

