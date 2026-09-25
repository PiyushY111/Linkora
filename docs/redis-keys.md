# Redis Keys

Linkora uses one Redis database (`REDIS_URL`) for everything: the link cache, click-cap counters, rate limits, refresh-token families, single-use tokens, locks, unique-visitor HyperLogLogs and two streams. Every key has a TTL except the streams, which are capped with `XADD MAXLEN ~`. Because nothing grows without bound, the instance can run `maxmemory-policy noeviction`, which the non-cache keys need: an evicted refresh family logs a user out, and an evicted click-cap counter is re-seeded from a lagging MongoDB count.

`test/hygiene/redisKeyTtl.test.js` enforces this. It runs after the rest of the suite and fails if any key other than a capped stream has no TTL.

## Keys

| Key | Type | TTL / bound | Written by | Purpose |
|---|---|---|---|---|
| `link:meta:{shortCode}` | Hash | `REDIS_CACHE_TTL_SECONDS` (default 3600 s) | `setLinkMeta` in `src/services/cacheService.js` | Cached link for the redirect path. Stores `cachedAt`, `ttlSeconds` and `computeDelta` for XFetch. Deleted when the link is edited, toggled or deleted, reaches its click cap, or is flagged by the abuse rescan. |
| `link:meta:{shortCode}` (negative) | Hash `{ __NULL__: 1 }` | `REDIS_NEGATIVE_CACHE_TTL_SECONDS` (default 120 s) | `setNegativeCache` | Marks a code that doesn't exist, so repeated lookups for it don't reach MongoDB. |
| `lock:xfetch:{shortCode}` | String | 5 s (`SET ... PX 5000 NX`) | `getLinkMeta` | Lets one request refresh a near-expiry cache entry. Not deleted after the refresh; it expires. |
| `link:usage:{linkId}` | String (integer) | 7 days, refreshed on every click | `checkAndIncrementUsage` (Lua) | Click count for links with `maxClicks`. Seeded from `Link.clicks` the first time it's touched; the seed, increment and cap check are one script. |
| `link:unlock:{jti}` | String | 60 s | `src/controllers/analyticsController.js` | Single-use unlock token for a password-protected link, consumed with `GETDEL`. |
| `refresh:family:{familyId}:current` | String | `JWT_REFRESH_TOKEN_TTL_SECONDS` (default 30 days) | `src/utils/jwt.js` | The one currently valid refresh secret for a session family. |
| `refresh:family:{familyId}:user` | String | Same as above | `src/utils/jwt.js` | Owner user ID for the family. |
| `refresh:family:{familyId}:auth` | String (JSON) | Same as above | `src/utils/jwt.js` | How the session signed in: `{ authMethod: 'password' \| 'sso', ssoConnectionId }`. Carried across rotations; missing means password. |
| `refresh:user:{userId}:families` | Set | Same as above, refreshed on every issue | `issueRefreshToken` / `revokeUserSessions` | The user's family ids, so sessions can be revoked by kind (password sessions when an org starts enforcing SSO). Expired ids are pruned on use. |
| `sso:state:{state}` | String | 10 min | `src/routes/sso.js` | SSO `state` parameter, consumed on callback. |
| `ratelimit:{prefix}:{id}` | Sorted set | The window (`PEXPIRE`) | `createSlidingWindowLimiter` | Sliding-window log. Prefixes: `login`, `register`, `refresh`, `invite`, `sso-start` (per IP), `link-unlock` (per IP and short code), `link-creation` (per user, or IP). |
| `ratelimit:public-api:{apiKey}` | Hash `{ tokens, ts }` | 1 hour, refreshed on use | `createTokenBucketLimiter` | Public API token bucket (capacity 30, refill 10/s). |
| `ratelimit:auth-failures:{ip}` | String (integer) | 15 min from the first failure (`EXPIRE NX`) | `recordAuthFailure` | Failed-login counter; 5 failures block login from that IP. |
| `hll:visitors:{linkId}:{yyyymmdd}` | HyperLogLog | 2 days, refreshed on write | `src/repositories/analytics/mongoAnalyticsWriter.js` (Lua) | Unique visitors per link per UTC day. The count is copied into `link_stats_daily.unique` with `$max`. |
| `stream:clicks` (`CLICK_STREAM_KEY`) | Stream | `MAXLEN ~ CLICK_STREAM_MAXLEN` (default 10,000) | `emitClickEvent` | Click events from the redirect path. Consumer group `click-consumers` (`CLICK_STREAM_CONSUMER_GROUP`). |
| `stream:webhooks:dlq` (`WEBHOOK_DLQ_STREAM_KEY`) | Stream | `MAXLEN ~ WEBHOOK_DLQ_STREAM_MAXLEN` (default 1,000) | `executeDelivery` | Webhook deliveries that failed every retry. |

`MAXLEN ~` trims whole macro-nodes, so a stream can sit slightly above its cap. If the click consumer falls further behind than `CLICK_STREAM_MAXLEN`, the oldest unprocessed clicks are trimmed; the consumer acknowledges their IDs (returned by `XAUTOCLAIM`) and logs how many were lost.

## Command budget

The backend is meant to run on a free-tier Redis with a monthly command limit, so the hottest and most frequently polled paths have a fixed command cost:

| Path | Redis commands | Enforced by |
|---|---|---|
| `GET /health/liveness` | none | `test/integration/redisCommandBudget.test.js` |
| `GET /health/readiness` | `PING`, `XINFO` | same |
| Redirect, cache hit, plain link | `HGETALL`, `XADD` | same |
| Redirect, cache miss | `HGETALL`, `HSET`, `EXPIRE`, `XADD` | same |
| Idle click consumer | at most 30 per 10 minutes | `test/unit/clickConsumerPolling.test.js` |

Features add commands when used: a near-expiry cache hit may send `SET NX` for the XFetch lock, a link with `maxClicks` runs the usage script, and a password-protected link redeems its token with `GETDEL`.

Choices made to keep these numbers low:

- The redirect route has no Redis rate limiter; only the in-process `express-rate-limit` applies there (`src/routes/analytics.js`).
- The idle consumer's blocking `XREADGROUP` doubles its `BLOCK` from `CLICK_CONSUMER_BLOCK_MIN_MS` (1 s) up to `CLICK_CONSUMER_BLOCK_MAX_MS` (30 s). A new entry still ends a blocked read immediately, so this adds no latency.
- `XAUTOCLAIM` runs every `CLICK_CONSUMER_CLAIM_INTERVAL_MS` (5 min), not on every loop.
- Platform health checks should poll `/health/liveness`, which sends no commands. `/health/readiness` costs two commands per call.

## Splitting roles

Code asks for a Redis client by role:

- `getCacheRedis()`: data that can be rebuilt from MongoDB, namely `link:meta:*` and `lock:xfetch:*`.
- `getRedis()`: everything else, where losing a key is a correctness problem (logged-out sessions, a reset click cap, a replayable unlock token, lost stream entries).

Both return the same client today. To move the cache onto its own database or instance (for example one with `maxmemory-policy allkeys-lru`), change `getCacheRedis()` in `src/services/cacheService.js` to return a separate client; no caller needs to change. The non-cache keys must stay on a `noeviction` instance.
