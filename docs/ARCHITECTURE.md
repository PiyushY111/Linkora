# Linkora Architecture

How Linkora serves redirects, ingests clicks, builds analytics and secures sessions and outbound requests. Every mechanism described here maps to code in `backend/src`; file names are given where it helps.

---

## Table of Contents

- [1. System Overview](#1-system-overview)
- [2. Redirect Path and Click Ingestion](#2-redirect-path-and-click-ingestion)
- [3. Stream Processing and Idempotent Writes](#3-stream-processing-and-idempotent-writes)
- [4. Pre-Aggregated Rollups and Bounded Dimensions](#4-pre-aggregated-rollups-and-bounded-dimensions)
- [5. XFetch Probabilistic Early Expiration](#5-xfetch-probabilistic-early-expiration)
- [6. Short-Code Generation](#6-short-code-generation)
- [7. Data Model](#7-data-model)
  - [7.1 MongoDB Collections](#71-mongodb-collections)
  - [7.2 Redis Keys](#72-redis-keys)
- [8. Security Design](#8-security-design)
  - [8.1 Refresh-Token Rotation and Family Revocation](#81-refresh-token-rotation-and-family-revocation)
  - [8.2 Cross-Site Refresh Cookie (CHIPS)](#82-cross-site-refresh-cookie-chips)
  - [8.3 SSRF Defense and DNS Pinning](#83-ssrf-defense-and-dns-pinning)
  - [8.4 Webhook Signing, Retries and Circuit Breakers](#84-webhook-signing-retries-and-circuit-breakers)
  - [8.5 Rate Limiting](#85-rate-limiting)
- [9. Deployment Topologies](#9-deployment-topologies)

---

## 1. System Overview

```
[ Inbound HTTP ]
       |
       v
+------------------------------------------------------------------------+
| OPTIONAL REVERSE PROXY (deployment-specific; not part of this repo)    |
|   TLS termination. Express trusts TRUST_PROXY_HOPS proxy hops.         |
+------------------------------------------------------------------------+
       |
       v
+------------------------------------------------------------------------+
| EXPRESS API (ESM, Node 22)                         src/app.js          |
|   - Helmet security headers (CSP, HSTS, nosniff, frame-ancestors)      |
|   - CORS allowlist                                                     |
|   - In-process rate limiter (express-rate-limit) on every route        |
|   - Redis sliding-window limiter on auth, unlock and link creation     |
|   - Origin/Referer check on cookie-authenticated refresh and logout    |
|   - JWT auth (dashboard) and scoped API keys (public API)              |
+------------------------------------------------------------------------+
       |                                          |
  GET /api/r/:shortCode                    /api/* (links, auth, analytics,
       |                                    webhooks, workspaces, public API)
       v                                          v
+-----------------------------+      +-------------------------------------+
| REDIRECT (analyticsController.redirectLink)                             |
|   cache read, status/expiry, |      | CONTROLLERS                         |
|   password unlock, click cap,|      |   link CRUD, auth, analytics reads, |
|   A/B + per-OS routing       |      |   webhooks, API keys                |
+-----------------------------+      +-------------------------------------+
       |                                          |
       v                                          v
+------------------------------------------------------------------------+
| REDIS (one database; see docs/redis-keys.md)                           |
|   link:meta:{code}     cached link (hash, TTL 1h; negative 120s)        |
|   link:usage:{linkId}  click-cap counter (7-day sliding TTL)            |
|   ratelimit:*          limiter state                                    |
|   refresh:family:*     refresh-token families (TTL 30d)                 |
|   stream:clicks        click stream (MAXLEN ~ 10000)                    |
+------------------------------------------------------------------------+
       |  cache miss: one findOne              |  XADD stream:clicks
       v                                       v
+-----------------------------+      +-------------------------------------+
| MONGODB                     |      | CLICK CONSUMER (src/consumers/      |
|   links, users, counters,   |<-----|   clickConsumer.js)                 |
|   api keys, webhooks, ...   |      |   XREADGROUP (group click-consumers)|
|   click_events (time-series)|      |   GeoIP + UA parse + bot flag       |
|   link_stats_hourly / daily |      |   idempotent batch write, then XACK |
|   processed_events          |      |   XAUTOCLAIM for stale entries      |
+-----------------------------+      +-------------------------------------+
                                                  |
                                                  v
                                     +-------------------------------------+
                                     | WEBHOOK DELIVERY (webhookService.js)|
                                     |   SSRF re-check + DNS-pinned connect|
                                     |   HMAC-SHA256 signature             |
                                     |   retries, then DLQ stream          |
                                     +-------------------------------------+
```

---

## 2. Redirect Path and Click Ingestion

A shortener that writes to its database on every redirect puts a write, and contention on the hot link's document, on the latency path of every click. Linkora splits the redirect from analytics persistence.

1. **Redirect** (`GET /api/r/:shortCode`, `redirectLink` in `src/controllers/analyticsController.js`):
   - Reads the cached link with `HGETALL link:meta:{shortCode}`. On a miss it reads MongoDB once (`findOne` by `shortCode` or `customAlias`, read preference `nearest`), fills the cache, and times that read as XFetch's delta (section 5). An unknown code gets a 120-second negative cache entry.
   - Checks active status and expiry against the cached entry. Password-protected links require a single-use unlock token (redeemed with `GETDEL`). Links with `maxClicks` go through an atomic Lua counter (`link:usage:{linkId}`).
   - Picks the destination: a sticky weighted A/B variant (FNV-1a hash of IP and user agent into 100 buckets) or the iOS/Android URL chosen by user agent.
   - Responds with `307` and `Cache-Control: no-store`, then appends the click with `XADD stream:clicks MAXLEN ~ 10000 * ...` without awaiting it.
   - A cache hit for a plain link sends exactly `HGETALL` and `XADD` to Redis and makes no MongoDB calls (`test/integration/redisCommandBudget.test.js`). Some paths add an unawaited MongoDB write after the response: A/B-test links `$inc` the chosen variant's counter, a link that serves its last allowed click is deactivated, and an XFetch refresh re-reads the link.

2. **Ingestion** (`src/consumers/clickConsumer.js`):
   - The consumer reads `stream:clicks` through the consumer group `click-consumers` (`XREADGROUP ... COUNT 500 BLOCK n`). It runs as its own process (`WORKER_MODE=separate`, `npm run consumer`) or inside the API process (`WORKER_MODE=embedded`, started by `src/server.js`). Several consumers can share the group.
   - Each event is enriched: GeoIP (MaxMind GeoLite2 when `GEOIP_DB_PATH` points at a `.mmdb` file, otherwise the bundled `geoip-lite` dataset), user-agent parsing (`ua-parser-js`), a SHA-256 hash of the IP, and the bot flag set at redirect time.
   - The batch is written to MongoDB with unordered `bulkWrite`/`insertMany` calls (section 3), and only then acknowledged with `XACK`. An event that fails enrichment stays unacknowledged and is retried.
   - While idle, the blocking read doubles its `BLOCK` from 1 s up to 30 s, and stale pending entries are reclaimed with `XAUTOCLAIM` every 5 minutes, to keep the idle Redis command count low (`docs/redis-keys.md`, "Command budget").

---

## 3. Stream Processing and Idempotent Writes

A consumer can crash mid-batch, or a batch write can fail, and the entries are then redelivered via `XAUTOCLAIM`. MongoDB time-series collections can't be written inside a multi-document transaction, so instead of a transaction every write is made idempotent on its own (`src/repositories/analytics/mongoAnalyticsWriter.js`). Delivery is at least once; the writes make each event apply once.

```
[ Batch of stream entries (event ID = stream entry ID, e.g. 1727161200000-0) ]
                      |
                      v
       [ Claim in processed_events: insert { _id: eventId, state: 'pending' } ]
         duplicate key + state 'done'  --> skip event
         duplicate key + state 'pending' --> resume (earlier attempt was interrupted)
                      |
                      v
       [ Insert raw row into click_events ]
         (for resumed events, only if no row with that eventId exists)
                      |
                      v
       [ link_stats_hourly and link_stats_daily: conditional $inc upserts ]
       [ Link.clicks: conditional $inc ]
         filter includes appliedIds / appliedClickIds: { $ne: eventId }
         update pushes eventId into a window of the last 1,000 IDs
                      |
                      v
       [ Unique visitors: PFADD into hll:visitors:{linkId}:{day}, then $max into the daily rollup ]
                      |
                      v
       [ Mark processed_events 'done' ]  -->  [ XACK ]
```

1. **Ledger (`processed_events`)**: the stream entry ID is the event ID and the ledger's `_id`, so claiming is an `insertMany` that fails with a duplicate key for anything seen before. Entries expire after 3 days, which covers the redelivery window (stale entries are reclaimed within minutes).

2. **Per-document dedup windows**: each rollup document (`appliedIds`) and each `Link` (`appliedClickIds`) keeps the last 1,000 applied event IDs. The increment is conditional on the ID not being in the window, in the same single-document update:
   ```javascript
   { updateOne: {
       filter: { _id: linkId, appliedClickIds: { $ne: eventId } },
       update: {
         $inc: { clicks: 1 },
         $max: { lastAccessedAt: timestamp },
         $push: { appliedClickIds: { $each: [eventId], $slice: -1000 } },
       },
   } }
   ```
   A redelivered event matches nothing and changes nothing. `CLICK_STREAM_BATCH_SIZE` is validated at startup to be at most 1,000 (`src/config/env.js`), so a batch can't push its own IDs out of the window.

3. **Unique visitors**: `PFADD` is a set operation and the count is written with `$max`, so both are idempotent.

**Limits.** Dedup covers redeliveries within the ledger's 3-day TTL and the 1,000-ID windows. Events trimmed from the capped stream before any consumer reads them are lost; the consumer acknowledges their IDs and logs the count.

---

## 4. Pre-Aggregated Rollups and Bounded Dimensions

Dashboards read rollups, not raw events. The consumer maintains two collections, one document per link per bucket:

- `link_stats_hourly`: hourly buckets, expired after `CLICK_EVENT_RETENTION_DAYS` (default 90).
- `link_stats_daily`: daily buckets with no TTL, plus an approximate unique-visitor count from a Redis HyperLogLog.

Raw events in `click_events` have the same retention as hourly rollups and serve only the CSV export and the recent-clicks feed.

### Dimension caps
Each rollup document stores breakdowns under `dims.<dimension>.<value>` as `{ a, h }` (all clicks and human clicks), so bot filtering needs no second query. To keep documents bounded, each dimension holds a fixed number of distinct values per document (`src/repositories/analytics/rollupDimensions.js`):

| Dimension | Cap |
|---|---|
| country | 60 |
| city (`CC\|City`) | 50 |
| referrer | 50 |
| browser, os | 30 each |
| utmSource, utmMedium, utmCampaign | 30 each |
| variant | 20 |
| device | 10 |

Once a dimension is full, new values are counted under `__other__`. A breakdown is therefore "the first N values seen in this bucket, plus other", not a true top N; buckets are an hour or a day, so the set starts fresh often. Two consumers updating the same document at once can each add up to their batch's worth of keys, so the hard bound is the cap plus concurrent batches.

---

## 5. XFetch Probabilistic Early Expiration

When a hot key expires, every concurrent request misses and goes to the database at once (cache stampede). XFetch (Vattani, Chierichetti and Lowenstein) refreshes the entry shortly before it expires instead. On each cache hit, `getLinkMeta` in `src/services/cacheService.js` evaluates:

```
delta * beta * (-ln(rand())) >= remainingTtl
```

- `delta`: how long the MongoDB read took when this entry was last filled, stored with the entry (defaults to 25 ms).
- `beta`: eagerness, fixed at 1.0.
- `rand()`: uniform in (0, 1).
- `remainingTtl`: time left on the entry.

The probability of triggering rises as the entry approaches expiry. When it triggers, the request tries `SET lock:xfetch:{shortCode} 1 PX 5000 NX`. Only the request that gets the lock refreshes the entry, in the background, and every request, the winner included, is served the cached value. Measured effect: [`docs/BENCHMARKS.md`](BENCHMARKS.md#2-xfetch-probabilistic-early-expiration-benchmark).

**Limits.** XFetch is probabilistic: an entry can reach expiry without any request triggering a refresh (more likely for lightly read keys). The miss path has no lock, so a herd that arrives after a real expiry still reads MongoDB once per request.

---

## 6. Short-Code Generation

Random short codes run into the birthday problem: collision odds climb quickly as the number of codes grows, which means retry loops. Sequential codes reveal how many links exist and let anyone enumerate neighbours. Linkora uses a counter and a permutation (`src/utils/sequenceGenerator.js`):

- **Counter**: an atomic MongoDB counter (`Counter` collection, `findOneAndUpdate` with `$inc` and upsert). Each API instance reserves blocks of 1,000 values and hands them out from memory; concurrent refills within a process share one request. The counter lives in MongoDB rather than Redis because it must never repeat or go backwards, and Redis is treated as losable.
- **Permutation**: the value is masked to 32 bits and passed through a 4-round Feistel network whose round keys come from `LINK_SEQUENCE_CIPHER_KEY` (falling back to `JWT_SECRET`). A Feistel network is a bijection, so distinct inputs give distinct outputs.
- **Encoding**: Base62 (`0-9a-zA-Z`), padded to 6 characters. `62^6 ≈ 5.7 × 10^10` is larger than the 2^32 (about 4.29 billion) domain, so every code fits in 6 characters.

**Limits.** Codes are unique for the first 2^32 sequence values; past that, masked values repeat and the unique index on `shortCode` rejects the insert. Block reservation leaves gaps after a restart. The permutation hides creation order from casual inspection but is not a cryptographic guarantee against someone who studies many codes.

---

## 7. Data Model

### 7.1 MongoDB Collections

#### `links`
Link configuration, access controls and routing (`src/models/Link.js`).

| Field | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `ObjectId` | Primary key | Internal identifier |
| `user` | `ObjectId` | Required, ref `User` | Owner; queries filter by it |
| `originalUrl` | `String` | Required, trimmed | Destination URL |
| `shortCode` | `String` | Required, unique, case-sensitive | Generated Base62 code |
| `shortUrl` | `String` | Required, unique | Full public short URL |
| `customAlias` | `String` | Unique, sparse | User-chosen alias; also resolves on redirect |
| `title` / `description` | `String` | Max 200 / 500 chars | Dashboard metadata |
| `tags` | `Array<String>` | | Dashboard metadata |
| `category` | `String` | Enum: `business`, `personal`, `social`, `marketing`, `other` | Classification |
| `password` | `String` | bcrypt hash | Optional password gate |
| `maxClicks` | `Number` | Default `null` (unlimited) | Click cap; the link is deactivated when reached |
| `clicks` | `Number` | Default `0` | Click count maintained by the consumer |
| `isActive` | `Boolean` | Default `true` | Enabled/disabled |
| `abuseFlag` | `Boolean` | Default `false` | Set by the threat-detection rescan |
| `expiryDate` | `Date` | Optional | Redirects stop after this time |
| `expiredRedirectUrl` | `String` | Optional | Where expired, disabled or capped links send visitors |
| `routingType` | `String` | Enum: `direct`, `ab_test` | Routing strategy |
| `variants` | `Array<Object>` | `{ id, name, url, weight, clicks }` | Weighted A/B destinations |
| `iosRedirect` / `androidRedirect` | `String` | Optional | Per-OS destinations |
| `ogTitle` / `ogDescription` / `ogImage` | `String` | Optional | Preview card served to social crawlers |
| `utm` | `Object` | `{ source, medium, campaign, term, content }` | UTM parameters |
| `qrCode` / `qrConfig` | `String` / `Mixed` | Optional | QR image and styling |
| `lastAccessedAt` | `Date` | Updated with `$max` by the consumer | Last click time |
| `appliedClickIds` | `Array<String>` | `select: false`, last 1,000 | Dedup window for `clicks` |
| `createdAt` / `updatedAt` | `Date` | Timestamps | |

**Indexes**: `{ shortCode: 1 }` unique; `{ customAlias: 1 }` unique, sparse; `{ user: 1, createdAt: -1 }`; `{ user: 1, isActive: 1 }`.

#### `click_events` (time-series)
Raw click events (`src/models/ClickEvent.js`). `timeField: timestamp`, `metaField: meta`, granularity `seconds`, expired after `CLICK_EVENT_RETENTION_DAYS` (default 90).

| Field | Type | Description |
|---|---|---|
| `timestamp` | `Date` | Click time (UTC) |
| `meta.linkId` | `ObjectId` | Link |
| `meta.userId` | `ObjectId` | Link owner (nullable) |
| `eventId` | `String` | Stream entry ID; indexed for the redelivery check |
| `shortCode` | `String` | Code the visitor used |
| `ip` | `String` | Client IP as received (not anonymized) |
| `ipHash` | `String` | Unsalted SHA-256 of the IP, used for unique-visitor counts |
| `country` / `city` | `String` | GeoIP result (ISO 3166-1 alpha-2 country) |
| `device` / `browser` / `os` | `String` | Parsed from the user agent |
| `referrerDomain` | `String` | Referrer hostname |
| `utmSource` / `utmMedium` / `utmCampaign` | `String` | From the redirect's query string |
| `variantId` / `variantName` | `String` | A/B variant served |
| `isBot` / `botName` | `Boolean` / `String` | User-agent bot match |

**Indexes**: `{ meta.linkId: 1, timestamp: -1 }`, `{ meta.userId: 1, timestamp: -1 }`, `{ eventId: 1 }`. Time-series collections can't have unique indexes, so `eventId` uniqueness comes from the `processed_events` ledger.

#### `link_stats_hourly` / `link_stats_daily`
One document per link per bucket (`src/models/LinkStats.js`): `linkId`, `userId`, `bucket`, `total`, `human`, `bot`, `unique` (daily only), `dims`, and the `appliedIds` dedup window. Unique index `{ linkId: 1, bucket: 1 }` (the upsert target), plus `{ userId: 1, bucket: 1 }`. Hourly documents expire after `CLICK_EVENT_RETENTION_DAYS`; daily documents don't expire.

#### `processed_events`
Ledger of claimed stream entries (`src/models/ProcessedEvent.js`): `_id` (stream entry ID), `state` (`pending` or `done`), `createdAt`, expiring after 3 days.

### 7.2 Redis Keys

Every key prefix, its data type, TTL and purpose is listed in [`docs/redis-keys.md`](redis-keys.md). In short: one Redis database holds the link cache, click-cap counters, rate-limiter state, refresh-token families, single-use tokens, XFetch locks, unique-visitor HyperLogLogs and two capped streams. Every key has a TTL except the streams, which are capped with `MAXLEN ~`; `test/hygiene/redisKeyTtl.test.js` checks this after every test run.

---

## 8. Security Design

### 8.1 Refresh-Token Rotation and Family Revocation

The access token is a 15-minute JWT that the React client keeps only in memory (a Zustand store), never in `localStorage`. The refresh token is `{familyId}.{secret}` in an HttpOnly cookie, rotated on every use. This follows the rotation-with-reuse-detection pattern from the OAuth 2.0 Security Best Current Practice (`src/utils/jwt.js`):

```
POST /api/auth/refresh   (cookie: refreshToken = F1.S1)
       |
       v
+-------------------------------------------------------------+
| One Lua script (atomic):                                    |
|   current = GET refresh:family:F1:current                   |
|   missing          -> fail (expired or already revoked)     |
|   current != S1    -> DEL both family keys; fail (reuse)    |
|   current == S1    -> DEL current; ok                       |
+-------------------------------------------------------------+
        /                                     \
   (ok: valid rotation)                   (fail)
      /                                         \
+------------------------------------+   +------------------------------------+
| Issue S2 in the same family:       |   | Clear the refresh cookie           |
|   SET refresh:family:F1:current S2 |   | 401 Unauthorized                   |
| New 15-minute access token         |   | (on reuse, a warning is logged)    |
| Set cookie F1.S2                   |   |                                    |
+------------------------------------+   +------------------------------------+
```

Presenting a secret that has already been rotated out is treated as theft: the whole family is deleted, which logs out the legitimate holder too. Families live only in Redis with a 30-day TTL, so losing Redis data ends every session. Logout deletes the family. Both `/refresh` and `/logout` also check `Origin`/`Referer` against the CORS allowlist (`src/middleware/csrf.js`).

### 8.2 Cross-Site Refresh Cookie (CHIPS)

In production the frontend and API can be on different sites (for example Vercel and Render), so the refresh cookie has to be sent cross-site. `src/utils/authCookies.js` sets:

- `HttpOnly`, `Path=/api/auth`, `Max-Age` 30 days.
- Production: `Secure`, `SameSite=None` and `Partitioned` (CHIPS), so the browser keys the cookie to the top-level site instead of treating it as a third-party tracking cookie.
- Development: `SameSite=Strict`, not `Secure`.
- `COOKIE_SAMESITE` and `COOKIE_SECURE` override the defaults; `Partitioned` is set only when production uses `SameSite=None`.

Because production uses `SameSite=None`, the Origin/Referer check in 8.1 is the CSRF defense for the two cookie-authenticated endpoints. Requests with neither header are allowed through (non-browser clients).

### 8.3 SSRF Defense and DNS Pinning

Two separate checks exist, one for link destinations and one for webhook targets.

**Link destinations** (`validateUrlSafety` in `src/middleware/ssrfValidator.js`, called through `src/services/linkUrlValidation.js`) run on create and update, from both the dashboard and the public API, for every redirect-capable field (`originalUrl`, `iosRedirect`, `androidRedirect`, `expiredRedirectUrl`, `variants[].url`):

```
[ Destination URL ]
        |
        v
  1. Scheme must be http: or https:
        |
        v
  2. Resolve all addresses (dns.lookup, all: true)
        |
        v
  3. Reject if any address is in:
       127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
       169.254.0.0/16 (includes 169.254.169.254), 0.0.0.0/8,
       ::1, fc00::/7, fe80::/10, or an IPv4-mapped form of the above
        |
        v
  4. Optional threat intel (Google Safe Browsing, VirusTotal), fails open
```

The redirect itself is a client-side `307`, so the server never fetches the destination; this check hardens what can be stored.

**Webhook targets** (`src/services/webhookService.js`) are checked at registration and again immediately before every delivery attempt:

- Cloud metadata hosts (`169.254.169.254`, `metadata.google.internal`) are always blocked. Loopback, RFC 1918 and link-local addresses are blocked only when `NODE_ENV=production`, so a local webhook can target this app during development.
- **DNS pinning**: the delivery re-resolves the hostname, picks an address that passes the policy, and sends the request through an undici `Agent` whose `lookup` always returns that address. A DNS answer that changes between the check and the connect (DNS rebinding) can't redirect the connection.
- **No redirects**: requests use `redirect: 'manual'`, and a 3xx response is recorded as a failure, so an endpoint can't bounce the request to an internal address.

### 8.4 Webhook Signing, Retries and Circuit Breakers

Each delivery is signed with the webhook's secret:

```
signature = HMAC-SHA256(secret, `${t}.${payload}`)       (hex)
Linkora-Signature: t=1727161200,v1=<signature>
```

Receivers should recompute the HMAC and reject a timestamp more than 300 seconds from their clock; the verification guide in the dashboard does this. `X-Linkora-Signature` carries an older, untimestamped form (`HMAC-SHA256(secret, payload)`). For backward compatibility the same values are also sent as `Linkly-Delivery`, `Linkly-Event`, `Linkly-Signature` and `X-Linkly-Signature`.

**Retries**: a failed delivery is retried up to 4 times, after 10 s, 1 min, 5 min and 30 min (each plus up to 2 s of jitter), for 5 attempts in total. Retries are scheduled with in-process timers, so a process restart drops any pending retry. After the last attempt the delivery is marked `failed` and appended to the `stream:webhooks:dlq` stream (`MAXLEN ~ 1000`). Every attempt is recorded in the `WebhookDelivery` model with status, latency and a response preview of up to 2 KB, and an endpoint is disabled after 10 consecutive failures.

**Circuit breakers**: Opossum breakers (3 s timeout, trip at 50% errors, 30 s reset) wrap the third-party calls on the link-creation path: Google Safe Browsing and VirusTotal (which fail open when the breaker is open) and the Cloudinary QR upload (which falls back to an inline Base64 image). Webhook delivery doesn't use a breaker; it relies on the retry schedule and the auto-disable above.

### 8.5 Rate Limiting

`src/middleware/rateLimiter.js` has two Redis-backed limiters, both single Lua scripts so they are atomic across API instances:

| Limiter | Algorithm | Applied to | Limit |
|---|---|---|---|
| `createSlidingWindowLimiter` | Sliding-window log (sorted set) | Login | 20 / 15 min per IP |
| | | Registration | 10 / hour per IP |
| | | Refresh | 30 / 15 min per IP |
| | | Link unlock | 5 / 15 min per IP and short code |
| | | Link creation | 30 / hour (free), 1,000 / hour (pro), per user (IP if anonymous) |
| `createTokenBucketLimiter` | Token bucket (hash) | Public API v1 | Burst 30, refill 10/s, per API key |

Failed logins are also counted separately (`ratelimit:auth-failures:{ip}`, 5 per 15-minute fixed window). The Redis limiters fail open if Redis is unreachable.

Every route also passes through `express-rate-limit` with its default in-process store (`RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW` minutes per IP, 1,500 per 15 min by default). This is the only limiter on the redirect route: a Redis limiter there would add a Redis command to every redirect. Because the store is in memory, that limit applies per API instance.

Client IPs come from `getClientIp` (`src/utils/helpers.js`), which reads `CF-Connecting-IP`, then `X-Real-IP`, then the first `X-Forwarded-For` entry, then the socket address.

---

## 9. Deployment Topologies

The backend runs in one of two modes, chosen by `WORKER_MODE`:

```
[ WORKER_MODE=embedded (default in src/config/env.js) ]
  - React SPA (static hosting)
  - One Node process: Express API + click consumer
    (the consumer uses its own Redis connection for the blocking read)
  - MongoDB (e.g. Atlas)
  - Redis (e.g. Upstash), maxmemory-policy noeviction
```

```
[ WORKER_MODE=separate (.env.example) ]
  - React SPA (static hosting)
  - N API processes (npm start)
  - M consumer processes (npm run consumer), sharing the consumer group
  - MongoDB
  - Redis, maxmemory-policy noeviction
```

What is safe with more than one process:

- **Consumers**: yes. The consumer group shares entries between them, and a crashed consumer's pending entries are reclaimed with `XAUTOCLAIM` once they have been idle 30 s, on the next 5-minute claim pass.
- **API instances**: yes for correctness. The Redis limiters, refresh families, click caps and link cache are shared, and each instance reserves its own short-code blocks. Two things stay per instance: the in-memory `express-rate-limit` counters and pending webhook retry timers.
- **Cron jobs** (abuse rescan, expiry webhooks, GeoIP database updates) run in every process that schedules them; there's no leader election.
