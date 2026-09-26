import { getRedis } from '../services/cacheService.js';
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
      scriptSha = await getRedis().script('LOAD', SLIDING_WINDOW_SCRIPT);
    }
    const [allowed, remaining] = await getRedis().evalsha(scriptSha, 1, ...args);
    return { allowed: allowed === 1, remaining };
  } catch (err) {
    if (String(err.message).includes('NOSCRIPT')) {
      scriptSha = await getRedis().script('LOAD', SLIDING_WINDOW_SCRIPT);
      const [allowed, remaining] = await getRedis().evalsha(scriptSha, 1, ...args);
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
  const count = await getRedis().get(authFailureKey(ip));
  return Number(count) >= AUTH_FAILURE_MAX;
}

/**
 * @param {string} ip
 */
export async function recordAuthFailure(ip) {
  // INCR and EXPIRE NX in one MULTI: a separate EXPIRE after INCR could be
  // lost to a crash in between, leaving a counter with no TTL. NX keeps the
  // window fixed from the first failure instead of sliding it.
  await getRedis()
    .multi()
    .incr(authFailureKey(ip))
    .expire(authFailureKey(ip), AUTH_FAILURE_WINDOW_SECONDS, 'NX')
    .exec();
}

/**
 * @param {string} ip
 */
export async function resetAuthFailures(ip) {
  await getRedis().del(authFailureKey(ip));
}

/**
 * Token-bucket rate limiter for the public API gateway. Unlike the
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
    if (!tokenBucketSha) tokenBucketSha = await getRedis().script('LOAD', TOKEN_BUCKET_SCRIPT);
    const [allowed, remaining] = await getRedis().evalsha(tokenBucketSha, 1, ...args);
    return { allowed: allowed === 1, remaining };
  } catch (err) {
    if (String(err.message).includes('NOSCRIPT')) {
      tokenBucketSha = await getRedis().script('LOAD', TOKEN_BUCKET_SCRIPT);
      const [allowed, remaining] = await getRedis().evalsha(tokenBucketSha, 1, ...args);
      return { allowed: allowed === 1, remaining };
    }
    throw err;
  }
}

// Public API bucket: bursts up to 30 requests, sustained ~10 req/s per API
// key. Shared by the route's limiter and GET /usage so the usage endpoint
// reports the limits that are actually enforced.
export const PUBLIC_API_TOKEN_BUCKET = Object.freeze({
  capacity: 30,
  refillPerSecond: 10,
  keyPrefix: 'public-api',
});

/**
 * The Redis key of the bucket a request draws from. Keyed by the ApiKey
 * document id, so a key's raw-key traffic and the dashboard's masked-key
 * requests for it share one bucket, and raw keys never appear in Redis key
 * names. Legacy User.apiKey callers have no document and keep the old key.
 * @param {string} keyPrefix
 * @param {import('express').Request} req
 */
export function tokenBucketKey(keyPrefix, req) {
  const identifier = req.apiKeyDoc?._id
    ? `key:${req.apiKeyDoc._id}`
    : req.apiKeyUser?.apiKey || getClientIp(req);
  return `ratelimit:${keyPrefix}:${identifier}`;
}

/**
 * Current token count of a bucket, using the same refill math as
 * TOKEN_BUCKET_SCRIPT but without consuming a token or writing anything
 * back. A bucket that doesn't exist yet is full, as the script treats it.
 * @param {string} key
 * @param {number} capacity
 * @param {number} refillPerSecond
 */
export async function peekTokenBucket(key, capacity, refillPerSecond) {
  const [storedTokens, storedTs] = await getRedis().hmget(key, 'tokens', 'ts');
  if (storedTokens === null) return capacity;

  const elapsedSeconds = Math.max(0, Date.now() - Number(storedTs)) / 1000;
  return Math.min(capacity, Number(storedTokens) + elapsedSeconds * refillPerSecond);
}

/**
 * @param {{ capacity: number, refillPerSecond: number, keyPrefix: string, cost?: number }} options
 */
export function createTokenBucketLimiter({ capacity, refillPerSecond, keyPrefix, cost = 1 }) {
  return async (req, res, next) => {
    const key = tokenBucketKey(keyPrefix, req);

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

// Registration: 10 accounts per hour per IP (spam/enumeration deterrent).
export const registerRateLimiter = createSlidingWindowLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: 'register',
});

// Refresh rotation: 30 per 15 min per IP. Legitimate clients refresh once
// per access-token lifetime (15m), so this comfortably covers multiple tabs
// or devices while bounding abuse of the rotation endpoint.
export const refreshRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyPrefix: 'refresh',
});

// Link-unlock attempts: 5 per 15 min per IP+shortCode, so a wrong-password
// guessing loop against one link can't be retried indefinitely.
export const unlockRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'link-unlock',
  keyFn: (req) => `${getClientIp(req)}:${req.params.shortCode}`,
});

// Invite link lookups/accepts: 30 per 15 min per IP. Tokens are 256-bit so
// this isn't about guessing; it bounds a public, unauthenticated DB lookup.
export const inviteRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyPrefix: 'invite',
});

// "Sign in with SSO" org lookups: 30 per 15 min per IP, bounding slug
// probing on this unauthenticated endpoint.
export const ssoStartRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyPrefix: 'sso-start',
});

// Bio page slug availability: 60 per 15 min per IP. The builder checks as
// the user types (debounced), and this bounds slug enumeration on an
// unauthenticated lookup.
export const bioSlugCheckRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyPrefix: 'bio-slug-check',
});

// Login attempts: 20 per 15 min per IP in production (protects CPU & bcrypt hashing against request flooding).
export const loginRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  keyPrefix: 'login',
});

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

export default {
  createSlidingWindowLimiter,
  linkCreationRateLimiter,
  registerRateLimiter,
  refreshRateLimiter,
  unlockRateLimiter,
  loginRateLimiter,
  authRateLimitMiddleware,
};
