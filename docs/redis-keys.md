# Redis Keys

Linkora uses **one Redis database** (`REDIS_URL`) for everything ([ADR 0006](adr/0006-single-redis-database.md)). Every key has a TTL or a hard size bound, so the instance never grows without limit. Run it with **`maxmemory-policy noeviction`**: several keys below (refresh tokens, usage limits, the click stream) are not re-derivable, so an evicting policy would turn memory pressure into silent correctness bugs.

This is checked by a test. `backend/test/hygiene/redisKeyTtl.test.js` runs after the rest of the suite, scans every key the run left in the test database, and fails if any key other than the two capped streams has no TTL.

## Key inventory

Sizes were measured with `MEMORY USAGE` on Redis 8 (see "Memory budget").

| Pattern | Purpose | Written by | TTL / bound | Approx. size |
|---|---|---|---|---|
| `link:meta:<code>` | Read-through cache of a link's redirect metadata (hash), including a negative-cache marker for unknown codes | `services/cacheService.js` | `REDIS_CACHE_TTL_SECONDS` (default **3600 s**); negative entries `REDIS_NEGATIVE_CACHE_TTL_SECONDS` (default 120 s) | ~510 B (hit), ~100 B (negative) |
| `lock:xfetch:<code>` | Single-flight lock for the XFetch early cache refresh | `cacheService.getLinkMeta` | **5 s** (`PX 5000`) | ~60 B |
| `link:usage:<linkId>` | `maxClicks` counter (atomic Lua seed + INCR) | `cacheService.checkAndIncrementUsage` | **7 days, sliding** (refreshed on every click; re-seeded from `Link.clicks` after expiry) | ~64 B |
| `link:unlock:<jti>` | Single-use password-unlock token | `analyticsController` | **60 s**; consumed with `GETDEL` | ~75 B |
| `sso:state:<state>` | SSO CSRF `state` | `routes/sso.js` | `SSO_STATE_TTL_SECONDS`; consumed with `GETDEL` | ~75 B |
| `refresh:family:<id>:current` / `:user` | Refresh-token rotation family (current secret, owner) | `utils/jwt.js` | `JWT_REFRESH_TOKEN_TTL_SECONDS` (default **30 days**) | ~150 B per key |
| `ratelimit:<prefix>:<id>` (sorted set) | Sliding-window limiters: register, refresh, link-creation, link-unlock | `middleware/rateLimiter.js` | `PEXPIRE` = the window (15 min to 1 h); at most `max` members | ~200 B, plus ~60 B per request in the window |
| `ratelimit:public-api:<keyId>` (hash) | Public API token bucket | `middleware/rateLimiter.js` | **1 h** | ~100 B |
| `ratelimit:auth-failures:<ip>` | Failed-login counter | `middleware/rateLimiter.js` | **15 min**, fixed from the first failure (`INCR` + `EXPIRE NX` in one `MULTI`) | ~70 B |
| `hll:visitors:<linkId>:<yyyymmdd>` | Unique-visitor HyperLogLog per link per UTC day | `repositories/analytics/mongoAnalyticsWriter.js` | **2 days** (refreshed on write) | ~200 B sparse, **≤ 14.4 KB** dense |
| `stream:clicks` | Click events from redirects to the consumer, including the consumer group and its pending-entries list | `services/eventStreamService.js` | **`MAXLEN ~ CLICK_STREAM_MAXLEN`** (default 10,000) | ~300 B per entry → ~3 MiB at cap |
| `stream:webhooks:dlq` | Webhook deliveries that exhausted their retries | `services/webhookService.js` | **`MAXLEN ~ WEBHOOK_DLQ_STREAM_MAXLEN`** (default 1,000) | ~1 KB+ per entry (includes payload) |

The two streams are the only keys without a TTL. `MAXLEN ~` trims whole radix-tree nodes, so a stream can sit up to about 100 entries above its cap.

**Trimming loses data if the consumer falls behind.** If the consumer is down long enough for more than `CLICK_STREAM_MAXLEN` clicks to queue up, the oldest unprocessed clicks are trimmed. `XAUTOCLAIM` reports pending IDs whose entries were trimmed; the consumer logs them at error level ("trimmed from the stream before processing; lost") and ACKs them, so the pending-entries list doesn't grow forever.

## Memory budget (256 MB instance)

| Consumer | Assumption | Memory |
|---|---|---|
| `stream:clicks` | Full at 10,000 entries (measured 2.98 MiB for 10,000 realistic entries) | 3 MiB |
| `stream:webhooks:dlq` | Full at 1,000 entries, ~2 KB payloads | 2 MiB |
| `link:meta:*` | 20,000 distinct links requested within one TTL (1 h) | 10 MiB |
| `hll:visitors:*` | 5,000 links clicked per day × 2 days; 90% sparse (~0.3 KB), 10% dense (14.4 KB) | 17 MiB |
| `refresh:family:*` | 20,000 live sessions × 2 keys × 150 B | 6 MiB |
| `ratelimit:*` | 5,000 active IPs/users, ~1 KB each | 5 MiB |
| `link:usage:*`, tokens, locks | 20,000 × ~70 B | 1.5 MiB |
| Redis baseline | Empty-instance overhead | ~1 MiB |
| **Total** | | **~46 MiB** |

That leaves more than 5× headroom on a 256 MB instance at these volumes, well above what a free-tier deployment sees. The two items that scale with traffic are HyperLogLogs (per active link per day) and cached link metadata (per distinct hot link). Both expire on their own. If memory runs short:

- lower `REDIS_CACHE_TTL_SECONDS`, which only costs more MongoDB reads
- then lower `CLICK_STREAM_MAXLEN`, which leaves less room for consumer downtime

## Command budget

Free-tier Redis (Upstash) allows **500,000 commands a month**. Every command counts, including each command inside a `MULTI`/`EXEC`, and a Lua script counts as one. These numbers are pinned by tests:

- `backend/test/integration/redisCommandBudget.test.js` records the exact commands the API sends.
- `backend/test/unit/clickConsumerPolling.test.js` measures an idle consumer under fake timers.

### Per request (API)

| Operation | Commands | Which |
|---|---|---|
| **Redirect, cache hit** | **2** | `HGETALL link:meta`, `XADD stream:clicks` (test-pinned) |
| Redirect, cache miss | 4 | `HGETALL`, `HSET` + `EXPIRE` (repopulate), `XADD` (test-pinned) |
| Redirect to an unknown code | 3, then 1 while the negative entry lives | `HGETALL`, `HSET` + `EXPIRE` |
| … link has `maxClicks` | +1 | usage Lua script |
| … password-protected link | +1 on redirect, 2 on `POST /unlock` | `GETDEL`; limiter script + `SET` |
| … XFetch early refresh (only near cache expiry) | +3 | `SET NX` lock, `HSET` + `EXPIRE` |
| `GET /health/liveness` | **0** | (test-pinned) |
| `GET /health/readiness` | 2 | `PING`, `XINFO` (test-pinned) |
| Create link (dashboard) | 1 | link-creation limiter script |
| Public API request | 1 | token-bucket script |
| Login | 2 to 6 | failure check, failure counter or reset, refresh-token `MULTI` |
| Refresh session | 5 | limiter script, consume script, `MULTI SET SET EXEC` |

The redirect path used to also run a Redis sliding-window limiter, one more script per redirect. It was removed because the in-memory limiter in `app.js` already covers that route with a much lower ceiling, so the Redis one could never reject anything.

### Worker

| Situation | Commands |
|---|---|
| Per batch | `XREADGROUP` + `XACK` + 1 unique-visitor script per (link, day) in the batch |
| Sparse traffic (each click its own batch) | **3 per click** |
| Busy (500-entry batches) | 2 + (distinct link-days) per 500 clicks |
| **Idle** | **136 an hour**: 124 `XREADGROUP` (BLOCK backs off 1s → 2s → … → 30s) + 12 `XAUTOCLAIM` (every 5 min). That's 26 per 10 minutes, and the test budget is < 30. |
| Connection handshake | 5 per connection (`HELLO`, `SELECT`, 2 × `CLIENT SETINFO`, `INFO`), once per connect or reconnect; the worker holds 2 connections, the API 1 |
| Script load | 1 `SCRIPT LOAD` per script per process start |

The previous loop, a fixed 1s BLOCK plus `XAUTOCLAIM` on every iteration, spent about **7,200 commands an hour while idle (~5.2M a month)**, ten times the whole free budget before a single click.

### Monthly estimate

At sparse traffic, with a warm cache and plain links:

```
monthly ≈ 99,000 (idle worker: 136/h × 730 h) + 5 × N redirects (2 API + 3 worker)
```

| Redirects per month (N) | Commands per month | Share of 500K |
|---|---|---|
| 10,000 | ~149,000 | 30% |
| 50,000 | ~349,000 | 70% |
| **80,000** | **~499,000** | **~100%** |
| 100,000 | ~599,000 | over |

The idle floor is an upper bound: while clicks flow, reads return immediately and replace idle reads. Busy traffic also batches, which cuts the worker's per-click cost toward zero. So ~80K redirects a month is the conservative ceiling for the free tier.

To stretch the budget:

- `CLICK_CONSUMER_BLOCK_MAX_MS=120000` drops the idle floor to ~42/h (~31K a month) and raises the ceiling to ~94K redirects. A long BLOCK costs no click latency, because a blocked read returns as soon as an entry arrives.
- Point the platform health check at `/health/liveness` (0 commands). Polling `/health/readiness` every 30 seconds alone would cost ~173K commands a month.
- Longer `REDIS_CACHE_TTL_SECONDS` turns more 4-command misses into 2-command hits.

## Splitting roles again later

Code asks Redis for a role, not a URL:

- `getRedis()`: data whose loss is a correctness bug (streams, tokens, rate limits, usage counters, HyperLogLogs)
- `getCacheRedis()`: the re-derivable `link:meta:*` cache and its XFetch lock

Both return the same client today (`services/cacheService.js`). To move the cache onto its own instance, for example with `allkeys-lru` so cache pressure can never block writes:

1. Add `REDIS_CACHE_URL` to the env schema.
2. Give `getCacheRedis()` its own client created from that URL, and close it in `closeRedis()`.
3. Run the cache instance with `allkeys-lru` and keep `REDIS_URL` on `noeviction`.

No call site changes: every cache access already goes through `getCacheRedis()`.
