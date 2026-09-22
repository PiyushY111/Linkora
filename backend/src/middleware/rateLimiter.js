import { redis } from '../services/cacheService.js';
import { getClientIp } from '../utils/helpers.js';

/**
 * Atomic sliding-window-log rate limiter. Evicts entries older than the
 * window, counts what's left, and admits the request in one round trip so
 * concurrent requests across app instances can never race past the limit.
 *
 * KEYS[1] = rate limit key
 * ARGV[1] = now (ms)
 * ARGV[2] = window size (ms)
 * ARGV[3] = max requests in the window
 * ARGV[4] = unique member id for this request
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1}
else
  return {0, 0}
end
`;

let scriptSha = null;

async function evalSlidingWindow(key, windowMs, limit) {
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  const args = [key, now, windowMs, limit, member];

  try {
    if (!scriptSha) {
      scriptSha = await redis.script('LOAD', SLIDING_WINDOW_SCRIPT);
    }
    const [allowed, remaining] = await redis.evalsha(scriptSha, 1, ...args);
    return { allowed: allowed === 1, remaining };
  } catch (err) {
    if (String(err.message).includes('NOSCRIPT')) {
      scriptSha = await redis.script('LOAD', SLIDING_WINDOW_SCRIPT);
      const [allowed, remaining] = await redis.evalsha(scriptSha, 1, ...args);
      return { allowed: allowed === 1, remaining };
    }
    throw err;
  }
}

/**
 * @param {{ windowMs: number, max: number | ((req: import('express').Request) => number), keyPrefix: string, keyFn?: (req: import('express').Request) => string }} options
 */
export function createSlidingWindowLimiter({ windowMs, max, keyPrefix, keyFn = getClientIp }) {
  return async (req, res, next) => {
    const identifier = keyFn(req);
    const limit = typeof max === 'function' ? max(req) : max;
    const key = `ratelimit:${keyPrefix}:${identifier}`;

    try {
      const { allowed, remaining } = await evalSlidingWindow(key, windowMs, limit);
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(Math.max(0, remaining)));

      if (!allowed) {
        return res.status(429).json({ success: false, message: 'Too many requests, please try again later' });
      }
      next();
    } catch (err) {
      // Fail open: a Redis outage shouldn't take down the whole API surface.
      req.log?.error({ err }, 'Rate limiter check failed; allowing request');
      next();
    }
  };
}

// Redirect route: 5,000 req/min per IP.
export const redirectRateLimiter = createSlidingWindowLimiter({
  windowMs: 60 * 1000,
  max: 5000,
  keyPrefix: 'redirect',
});

const LINK_CREATION_LIMITS = {
  free: 30,
  pro: 1000,
};

// Link creation, tiered by plan: Anonymous/Free 30/hr, Pro 1,000/hr,
// Enterprise a custom quota stored on the user record.
export const linkCreationRateLimiter = createSlidingWindowLimiter({
  windowMs: 60 * 60 * 1000,
  max: (req) => {
    const plan = req.user?.plan || 'free';
    if (plan === 'enterprise') return req.user?.rateLimitOverride || 100000;
    return LINK_CREATION_LIMITS[plan] || LINK_CREATION_LIMITS.free;
  },
  keyPrefix: 'link-creation',
  keyFn: (req) => req.user?.id || getClientIp(req),
});

const AUTH_FAILURE_WINDOW_SECONDS = 15 * 60;
const AUTH_FAILURE_MAX = 5;

function authFailureKey(ip) {
  return `ratelimit:auth-failures:${ip}`;
}

/**
 * Auth endpoints: 5 failed logins per 15 min per IP. Unlike the sliding
 * window limiters above, this only counts failures (checked before the
 * attempt, incremented after a bad password), so legitimate repeated
 * logins from the same IP aren't penalized.
 * @param {string} ip
 */
export async function isAuthRateLimited(ip) {
  const count = await redis.get(authFailureKey(ip));
  return Number(count) >= AUTH_FAILURE_MAX;
}

/**
 * @param {string} ip
 */
export async function recordAuthFailure(ip) {
  const key = authFailureKey(ip);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, AUTH_FAILURE_WINDOW_SECONDS);
  }
}

/**
 * @param {string} ip
 */
export async function resetAuthFailures(ip) {
  await redis.del(authFailureKey(ip));
}

/**
 * Token-bucket rate limiter (Phase 7.4's public API gateway). Unlike the
 * sliding-window limiter above, this allows short bursts up to `capacity`
 * while enforcing a steady-state `refillPerSecond` average — the shape
 * expected of a public API gateway.
 *
 * KEYS[1] = bucket key
 * ARGV[1] = capacity
 * ARGV[2] = refill rate (tokens/sec)
 * ARGV[3] = now (ms)
 * ARGV[4] = requested tokens
 */
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

local elapsed = math.max(0, now - ts) / 1000
tokens = math.min(capacity, tokens + elapsed * refillRate)

local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, 3600)

return {allowed, tokens}
`;

let tokenBucketSha = null;

async function evalTokenBucket(key, capacity, refillPerSecond, cost) {
  const now = Date.now();
  const args = [key, capacity, refillPerSecond, now, cost];

  try {
    if (!tokenBucketSha) tokenBucketSha = await redis.script('LOAD', TOKEN_BUCKET_SCRIPT);
    const [allowed, remaining] = await redis.evalsha(tokenBucketSha, 1, ...args);
    return { allowed: allowed === 1, remaining };
  } catch (err) {
    if (String(err.message).includes('NOSCRIPT')) {
      tokenBucketSha = await redis.script('LOAD', TOKEN_BUCKET_SCRIPT);
      const [allowed, remaining] = await redis.evalsha(tokenBucketSha, 1, ...args);
      return { allowed: allowed === 1, remaining };
    }
    throw err;
  }
}

/**
 * @param {{ capacity: number, refillPerSecond: number, keyPrefix: string, cost?: number }} options
 */
export function createTokenBucketLimiter({ capacity, refillPerSecond, keyPrefix, cost = 1 }) {
  return async (req, res, next) => {
    const identifier = req.apiKeyUser?.apiKey || getClientIp(req);
    const key = `ratelimit:${keyPrefix}:${identifier}`;

    try {
      const { allowed, remaining } = await evalTokenBucket(key, capacity, refillPerSecond, cost);
      res.set('X-RateLimit-Limit', String(capacity));
      res.set('X-RateLimit-Remaining', String(Math.floor(remaining)));

      if (!allowed) {
        return res.status(429).json({ success: false, message: 'Rate limit exceeded' });
      }
      next();
    } catch (err) {
      req.log?.error({ err }, 'Token bucket limiter check failed; allowing request');
      next();
    }
  };
}

export const authRateLimitMiddleware = async (req, res, next) => {
  const ip = getClientIp(req);
  try {
    if (await isAuthRateLimited(ip)) {
      return res.status(429).json({ success: false, message: 'Too many failed login attempts. Try again later.' });
    }
  } catch (err) {
    req.log?.error({ err }, 'Auth rate limit check failed; allowing request');
  }
  next();
};

export default { createSlidingWindowLimiter, redirectRateLimiter, linkCreationRateLimiter, authRateLimitMiddleware };
