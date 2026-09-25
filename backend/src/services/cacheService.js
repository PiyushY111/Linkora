import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redisCacheHitsTotal, redisCacheMissesTotal, redisXfetchEarlyRefreshesTotal } from '../middleware/metrics.js';

/**
 * One Redis database (REDIS_URL) holds everything: the link-meta cache,
 * the click stream, rate limits, refresh-token families, short-lived
 * tokens, locks, and unique-visitor HyperLogLogs. Every key has a TTL or a
 * hard bound (see docs/redis-keys.md), so the instance can run
 * maxmemory-policy noeviction without growing unbounded, which is what the
 * non-cache data requires.
 *
 * Code still asks for a role: getRedis() for data whose loss is a
 * correctness bug, getCacheRedis() for the re-derivable cache. Both return
 * the same client today; splitting them onto two databases later is a
 * change to getCacheRedis() alone (docs/redis-keys.md, "Splitting roles").
 */
export function createRedisClient(url = env.REDIS_URL, options = {}) {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    enableAutoPipelining: false,
    keepAlive: 15000,
    connectTimeout: 5000,
    ...options,
  });
  client.on('error', (err) => logger.error({ err, url: redactRedisUrl(url) }, 'Redis connection error'));
  client.on('connect', () => logger.info({ url: redactRedisUrl(url) }, 'Redis connected'));
  return client;
}

function redactRedisUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return 'redis://[unparseable]';
  }
}

let activeClient = null;

/** Refresh tokens, rate limits, streams, usage counters, locks, HLLs. */
export function getRedis() {
  if (!activeClient) activeClient = createRedisClient(env.REDIS_URL);
  return activeClient;
}

/** The link:meta:{shortCode} read-through cache. Same client as getRedis() today. */
export function getCacheRedis() {
  return getRedis();
}

/** Closes the shared client, if one was ever created. */
export async function closeRedis() {
  if (!activeClient) return;
  const client = activeClient;
  activeClient = null;
  await client.quit();
}

export const NEGATIVE_CACHE_MARKER = '__NULL__';

export const linkMetaKey = (shortCode) => `link:meta:${shortCode}`;
export const linkUsageKey = (linkId) => `link:usage:${linkId}`;
export const xfetchLockKey = (shortCode) => `lock:xfetch:${shortCode}`;

/**
 * @typedef {Object} LinkMeta
 * @property {string} originalUrl
 * @property {boolean} isActive
 * @property {number} expiryDate - unix ms, or 0 if no expiry
 * @property {string} passwordHash
 * @property {string} linkId
 * @property {string} userId
 * @property {string} workspaceId - '' for a link not yet migrated to a workspace
 * @property {number} [maxClicks] - 0 if no click limit
 * @property {number} [clicks] - Mongo's click count as of when this was cached;
 *   used only to seed the Redis usage counter the first time it's touched.
 */

/**
 * Builds the cache-hash-shaped LinkMeta object from a Link Mongoose
 * document (or lean object). This used to be duplicated inline at every
 * call site that populates the cache (the XFetch background refresh and
 * the cache-miss path both hand-built the same shape); now there's exactly
 * one place that defines what "the cached shape of a link" is.
 * @param {import('mongoose').Document | Record<string, unknown>} link
 * @returns {LinkMeta}
 */
export function buildLinkMetaFromDoc(link) {
  return {
    // Carried through so any code path holding only a cached `meta` (not
    // the live Mongo doc) can still invalidate BOTH cache keys a link is
    // reachable under — see invalidateLinkMetaForLink() below.
    shortCode: link.shortCode,
    customAlias: link.customAlias || null,
    originalUrl: link.originalUrl,
    isActive: link.isActive,
    expiryDate: link.expiryDate ? new Date(link.expiryDate).getTime() : 0,
    passwordHash: link.password || '',
    linkId: String(link._id),
    userId: String(link.user),
    workspaceId: link.workspace ? String(link.workspace) : '',
    maxClicks: link.maxClicks || 0,
    clicks: link.clicks || 0,
    iosRedirect: link.iosRedirect || '',
    androidRedirect: link.androidRedirect || '',
    expiredRedirectUrl: link.expiredRedirectUrl || '',
    routingType: link.routingType || 'direct',
    variants: link.variants || [],
    ogTitle: link.ogTitle || null,
    ogDescription: link.ogDescription || null,
    ogImage: link.ogImage || null,
  };
}

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
  const hash = await getCacheRedis().hgetall(key);

  if (!hash || Object.keys(hash).length === 0) {
    redisCacheMissesTotal.inc({ operation: 'link_meta' });
    return { status: 'miss' };
  }

  if (hash[NEGATIVE_CACHE_MARKER]) {
    redisCacheHitsTotal.inc({ operation: 'link_meta' });
    return { status: 'negative' };
  }

  redisCacheHitsTotal.inc({ operation: 'link_meta' });

  let variants = [];
  try {
    if (hash.variants) variants = JSON.parse(hash.variants);
  } catch {}

  const meta = {
    shortCode: hash.shortCode || shortCode,
    customAlias: hash.customAlias || null,
    originalUrl: hash.originalUrl,
    isActive: hash.isActive === 'true',
    expiryDate: Number(hash.expiryDate) || 0,
    passwordHash: hash.passwordHash || '',
    linkId: hash.linkId,
    userId: hash.userId,
    // Absent on entries cached before links carried a workspace.
    workspaceId: hash.workspaceId || '',
    maxClicks: Number(hash.maxClicks) || 0,
    clicks: Number(hash.clicks) || 0,
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
    const delta = Number(hash.computeDelta) || 25; // measured Mongo fetch time this entry was populated with
    const beta = 1.0; // Aggressiveness parameter
    const rand = Math.random();

    // Optimal probabilistic early expiration condition
    const xfetchThreshold = delta * beta * (-Math.log(rand || 0.0001));

    if (xfetchThreshold >= remainingMs) {
      // Expiration is nearing; attempt atomic lock acquisition so only ONE request refreshes
      const lockKey = xfetchLockKey(shortCode);
      const acquired = await getCacheRedis().set(lockKey, '1', 'PX', 5000, 'NX');
      if (acquired) {
        shouldRecomputeEarly = true;
        redisXfetchEarlyRefreshesTotal.inc();
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
 * `computeDelta` should be the actual measured Mongo fetch time (ms) for this
 * lookup, not a hardcoded guess — see analyticsController.js's redirectLink,
 * which times its own `Link.findOne` and passes the result through here.
 * `cachedAt` defaults to now but can be overridden — used by
 * scripts/run_xfetch_benchmark.js to backdate an entry so XFetch treats it
 * as near-expiry.
 * @param {string} shortCode
 * @param {LinkMeta & { computeDelta?: number, cachedAt?: number }} meta
 */
export async function setLinkMeta(shortCode, meta) {
  const key = linkMetaKey(shortCode);
  const pipeline = getCacheRedis().pipeline();
  pipeline.hset(key, {
    shortCode: meta.shortCode || shortCode,
    customAlias: meta.customAlias || '',
    originalUrl: meta.originalUrl || '',
    isActive: String(meta.isActive !== false),
    expiryDate: String(meta.expiryDate || 0),
    passwordHash: meta.passwordHash || '',
    linkId: meta.linkId || '',
    userId: meta.userId || '',
    workspaceId: meta.workspaceId || '',
    maxClicks: String(meta.maxClicks || 0),
    clicks: String(meta.clicks || 0),
    iosRedirect: meta.iosRedirect || '',
    androidRedirect: meta.androidRedirect || '',
    expiredRedirectUrl: meta.expiredRedirectUrl || '',
    routingType: meta.routingType || 'direct',
    variants: JSON.stringify(meta.variants || []),
    ogTitle: meta.ogTitle || '',
    ogDescription: meta.ogDescription || '',
    ogImage: meta.ogImage || '',
    cachedAt: String(meta.cachedAt ?? Date.now()),
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
  const pipeline = getCacheRedis().pipeline();
  pipeline.hset(key, NEGATIVE_CACHE_MARKER, '1');
  pipeline.expire(key, env.REDIS_NEGATIVE_CACHE_TTL_SECONDS);
  await pipeline.exec();
}

/**
 * Invalidates the cache entry immediately on edit/delete/status toggle.
 * Callers are responsible for invalidating BOTH the shortCode and (if set)
 * the customAlias — the redirect resolves by either, so a stale entry under
 * either key would keep serving old data.
 * @param {string} shortCode
 */
export async function invalidateLinkMeta(shortCode) {
  await getCacheRedis().del(linkMetaKey(shortCode));
}

/**
 * Invalidates both cache keys a link is reachable under in one call.
 * Accepts either a live Link doc/lean object ({ shortCode, customAlias })
 * or an already-cached LinkMeta (which now carries the same two fields via
 * buildLinkMetaFromDoc) — so a hot-path caller holding only `meta`, not a
 * fresh Mongo doc, can still clear both entries.
 * @param {{ shortCode?: string, customAlias?: string | null }} linkOrMeta
 */
export async function invalidateLinkMetaForLink(linkOrMeta) {
  const keys = [linkOrMeta?.shortCode, linkOrMeta?.customAlias].filter(Boolean);
  await Promise.all(keys.map((k) => invalidateLinkMeta(k)));
}

/**
 * Atomically seeds-if-missing, increments, and evaluates a link's usage
 * counter against its maxClicks cap, in one Lua script. Replaces the old
 * seedLinkUsage() (fire-and-forget SET NX) + checkAndIncrementUsage()
 * (plain INCR) pair: seeding and incrementing used to be two separate,
 * unordered round trips, so an INCR from a concurrent request could land
 * before the seed did and silently drop however many clicks Mongo already
 * had on record for this link.
 *
 * `baseCount` is passed on every call (not just the first) — the script
 * only actually uses it the moment the key doesn't exist yet; every
 * subsequent call is a no-op seed followed by a plain atomic increment.
 *
 * The key has a sliding USAGE_KEY_TTL_SECONDS TTL, refreshed on every
 * click. A link idle that long has also dropped out of the link-meta cache,
 * so the next click re-seeds from a fresh Mongo read of Link.clicks, which
 * the consumer keeps current (lagging only by the stream backlog).
 *
 * @param {string} linkId
 * @param {number} maxClicks - 0/undefined means unlimited (short-circuits, no Redis call)
 * @param {number} baseCount - current Mongo click count, used only to seed
 * @returns {Promise<{ allowed: boolean, current: number, max: number, reached: boolean }>}
 */
const USAGE_SCRIPT = `
local key = KEYS[1]
local baseCount = tonumber(ARGV[1])
local maxClicks = tonumber(ARGV[2])
local ttlSeconds = tonumber(ARGV[3])

if redis.call('EXISTS', key) == 0 then
  redis.call('SET', key, baseCount)
end

local current = redis.call('INCR', key)
redis.call('EXPIRE', key, ttlSeconds)
local allowed = 1
if current > maxClicks then
  allowed = 0
end
local reached = 0
if current >= maxClicks then
  reached = 1
end

return {allowed, current, reached}
`;

let usageScriptSha = null;
const USAGE_KEY_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function checkAndIncrementUsage(linkId, maxClicks, baseCount = 0) {
  if (!maxClicks || maxClicks <= 0) return { allowed: true };

  const key = linkUsageKey(linkId);
  const args = [key, baseCount, maxClicks, USAGE_KEY_TTL_SECONDS];

  let result;
  try {
    if (!usageScriptSha) usageScriptSha = await getRedis().script('LOAD', USAGE_SCRIPT);
    result = await getRedis().evalsha(usageScriptSha, 1, ...args);
  } catch (err) {
    if (!String(err.message).includes('NOSCRIPT')) throw err;
    usageScriptSha = await getRedis().script('LOAD', USAGE_SCRIPT);
    result = await getRedis().evalsha(usageScriptSha, 1, ...args);
  }

  const [allowed, current, reached] = result;
  return { allowed: allowed === 1, current, max: maxClicks, reached: reached === 1 };
}

/**
 * Returns the current recorded usage count from Redis (0 if never touched
 * yet — the probe path uses this read-only, so it must not seed).
 * @param {string} linkId
 * @returns {Promise<number>}
 */
export async function getCurrentUsage(linkId) {
  const key = linkUsageKey(linkId);
  const val = await getRedis().get(key);
  return Number(val) || 0;
}

/**
 * Returns cache diagnostics and XFetch early expiration statistics, read
 * from the Prometheus counters (the source of truth /metrics also reports)
 * rather than parallel INCR 'stats:...' counters that existed only
 * to duplicate them and cost a write on every single cache lookup.
 */
export async function getCacheDiagnostics() {
  const [hits, misses, earlyRefreshes, memoryInfo, dbsize] = await Promise.all([
    redisCacheHitsTotal.get().then((m) => sumMetricValues(m)),
    redisCacheMissesTotal.get().then((m) => sumMetricValues(m)),
    redisXfetchEarlyRefreshesTotal.get().then((m) => sumMetricValues(m)),
    getCacheRedis().info('memory').catch(() => ''),
    getCacheRedis().dbsize().catch(() => 0),
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
    // XFetch early refreshes that won the lock. Not a count of prevented
    // stampedes: nothing measures what would have happened without them.
    earlyRefreshes,
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
      status: getCacheRedis().status,
    },
  };
}

function sumMetricValues(metric) {
  return (metric?.values || []).reduce((sum, v) => sum + (v.value || 0), 0);
}

export default getRedis;
