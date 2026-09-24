# Redis keys

One Redis database (`REDIS_URL`) holds the link cache, the click stream, rate
limits, refresh-token families, and a few short-lived tokens. Every key
either has a TTL or is a stream capped with `XADD MAXLEN ~`. The
`redis-hygiene` test project (`backend/test/hygiene/redisKeyTtl.test.js`)
scans the test database after every run and fails on any key without one.

**Run Redis with `maxmemory-policy noeviction`.** Several keys below are not
re-derivable, so an evicting policy could drop them silently. Because every
key is bounded, `noeviction` does not mean unbounded growth.

## Key inventory

| Key | Type | Written by | Lifetime | If it is lost |
|---|---|---|---|---|
| `link:meta:{shortCode}` | hash | `services/cacheService.js` `setLinkMeta` | `REDIS_CACHE_TTL_SECONDS` (3600) | Re-read from MongoDB on the next redirect. |
| `link:meta:{shortCode}` holding `__NULL__` | hash | `setNegativeCache` | `REDIS_NEGATIVE_CACHE_TTL_SECONDS` (120) | One extra MongoDB read for an unknown code. |
| `lock:xfetch:{shortCode}` | string | `getLinkMeta` (`SET NX PX`) | 5 s | Another request may also refresh the cache early. |
| `link:usage:{linkId}` | string (counter) | `checkAndIncrementUsage` (Lua) | 7 days, refreshed on every click | Re-seeded from `Link.clicks`, which lags by the stream backlog, so a capped link can admit a few extra clicks. |
| `stream:clicks` (`CLICK_STREAM_KEY`) | stream + consumer group | `eventStreamService.js` `emitClickEvent` | `MAXLEN ~ CLICK_STREAM_MAXLEN` (10,000) | Unprocessed clicks are lost. Also see [KNOWN_BUGS](KNOWN_BUGS.md): entries trimmed before a consumer reads them are lost without a log line. |
| `stream:webhooks:dlq` (`WEBHOOK_DLQ_STREAM_KEY`) | stream | `webhookService.js` after the last retry | `MAXLEN ~ WEBHOOK_DLQ_STREAM_MAXLEN` (1,000) | Dead-letter records are lost; the delivery log in MongoDB still has them. |
| `hll:visitors:{linkId}:{YYYYMMDD}` | HyperLogLog | `mongoAnalyticsWriter.js` (Lua `PFADD` + `EXPIRE` + `PFCOUNT`) | 2 days | That day's unique count stops growing; the stored daily `unique` is written with `$max`, so it never goes down. |
| `refresh:family:{familyId}:current` | string | `utils/jwt.js` `issueRefreshToken` | `JWT_REFRESH_TOKEN_TTL_SECONDS` (30 days) | Every session in the family is logged out. |
| `refresh:family:{familyId}:user` | string | `issueRefreshToken` | 30 days | Same as above. |
| `link:unlock:{jti}` | string | `analyticsController.js` after a correct link password | 60 s, consumed with `GETDEL` | The visitor re-enters the password. |
| `sso:state:{state}` | string | `routes/sso.js` `/authorize` | 10 min, consumed with `GETDEL` | The SSO login has to be restarted. |
| `ratelimit:{prefix}:{id}` | sorted set | `rateLimiter.js` sliding-window limiter (Lua) | the window: 15 min or 1 h | The window resets early. |
| `ratelimit:auth-failures:{ip}` | string (counter) | `recordAuthFailure` (`INCR` + `EXPIRE NX`) | 15 min from the first failure | The failed-login lockout resets early. |
| `ratelimit:public-api:{key:ID \| user:ID \| ip:IP}` | hash | token-bucket limiter (Lua) | 1 h | The bucket refills early. The raw API key is never part of the key name. |

Sliding-window limiter prefixes: `register` (10 per hour per IP),
`link-creation` (30 per hour free, 1,000 pro, per user), `refresh`
(30 per 15 min per IP), `link-unlock` (5 per 15 min per IP and short code).

Where a limiter's Redis call fails, the request is **allowed** (fail open)
and the error is logged, so a Redis outage doesn't take the API down. That
also means rate limits are not enforced during one.

## Command budget

Free-tier Redis providers bill by command, so the hot paths are pinned by
tests:

| Path | Commands | Enforced by |
|---|---|---|
| `GET /health/liveness` | 0 | `test/integration/redisCommandBudget.test.js` |
| `GET /health/readiness` | 2 (`PING`, `XINFO`) | same |
| Cached redirect | 2 (`HGETALL`, `XADD`) | same |
| Uncached redirect | 4 (`HGETALL`, `HSET`, `EXPIRE`, `XADD`) | same |
| Idle click consumer | fewer than 30 per 10 minutes | `test/unit/clickConsumerPolling.test.js` |

Some redirects cost more: a link with `maxClicks` adds one `EVALSHA`, a
password-protected link adds one `GETDEL`, and an XFetch early refresh adds
one `SET NX`.

The idle consumer's blocking read starts at `CLICK_CONSUMER_BLOCK_MIN_MS`
(1 s) and doubles while the stream is empty, up to
`CLICK_CONSUMER_BLOCK_MAX_MS` (30 s). Stale pending entries are reclaimed
with `XAUTOCLAIM` every `CLICK_CONSUMER_CLAIM_INTERVAL_MS` (5 min). That is
about 2 commands a minute per idle consumer.

Point platform health checks at `/health/liveness`. Poll
`/health/readiness` rarely.

## Splitting roles

`cacheService.js` exposes two accessors: `getCacheRedis()` for the
re-derivable link cache (`link:meta:*`, `lock:xfetch:*`) and `getRedis()` for
everything else. Both return the same client today. To put the cache on a
separate, evicting instance (`allkeys-lru`), change `getCacheRedis()` alone
to return a client for that instance. Everything that must not be evicted
stays on `getRedis()`.
