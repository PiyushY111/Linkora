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
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  enableAutoPipelining: false,
});

redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
redis.on('connect', () => logger.info('Redis connected'));

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

/**
 * Reads link:meta:{shortCode} via a single HGETALL.
 * Returns:
 *  - `{ status: 'hit', meta }` on a real cache hit
 *  - `{ status: 'negative' }` when a negative cache entry is present
 *  - `{ status: 'miss' }` when the key does not exist in Redis at all
 * @param {string} shortCode
 */
export async function getLinkMeta(shortCode) {
  const key = linkMetaKey(shortCode);
  const hash = await redis.hgetall(key);

  if (!hash || Object.keys(hash).length === 0) {
    redisCacheMissesTotal.inc({ operation: 'link_meta' });
    return { status: 'miss' };
  }

  if (hash[NEGATIVE_CACHE_MARKER]) {
    redisCacheHitsTotal.inc({ operation: 'link_meta' });
    return { status: 'negative' };
  }

  redisCacheHitsTotal.inc({ operation: 'link_meta' });
  return {
    status: 'hit',
    meta: {
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
    },
  };
}

/**
 * Populates link:meta:{shortCode} via a pipeline (HSET + EXPIRE) with a 24h TTL.
 * @param {string} shortCode
 * @param {LinkMeta} meta
 */
export async function setLinkMeta(shortCode, meta) {
  const key = linkMetaKey(shortCode);
  const pipeline = redis.pipeline();
  pipeline.hset(key, {
    originalUrl: meta.originalUrl,
    isActive: String(meta.isActive),
    expiryDate: String(meta.expiryDate || 0),
    passwordHash: meta.passwordHash || '',
    linkId: meta.linkId,
    userId: meta.userId,
    maxClicks: String(meta.maxClicks || 0),
    iosRedirect: meta.iosRedirect || '',
    androidRedirect: meta.androidRedirect || '',
    expiredRedirectUrl: meta.expiredRedirectUrl || '',
  });
  pipeline.expire(key, env.REDIS_CACHE_TTL_SECONDS);
  await pipeline.exec();
}

/**
 * Writes a negative cache entry to prevent cache penetration for short codes
 * that don't exist in MongoDB. Stored as a hash field (not a plain SET) so the
 * hot-path HGETALL read never hits a WRONGTYPE error against this key.
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

export default redis;

