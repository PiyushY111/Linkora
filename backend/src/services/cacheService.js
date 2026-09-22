import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redisCacheHitsTotal, redisCacheMissesTotal } from '../middleware/metrics.js';

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
 */

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

export default redis;
