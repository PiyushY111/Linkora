# Linkora

[![CI Pipeline](https://img.shields.io/github/actions/workflow/status/PiyushY111/Linkora/ci.yml?branch=main&style=flat-square&label=CI%20Pipeline)](https://github.com/PiyushY111/Linkora/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248.svg?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-7.0-DC382D.svg?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)

Linkora is a URL shortener with click analytics. Redirects are served from a Redis cache, and click events go through a Redis Stream to a consumer that writes pre-aggregated rollups to MongoDB. It also has refresh-token rotation with reuse detection, SSRF checks on link destinations and webhook targets, and signed webhooks.

> **Architecture**: stream processing, idempotency, rollups, data model and security design are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
> **Redis keys**: every key prefix, its TTL and its purpose are in [`docs/redis-keys.md`](docs/redis-keys.md).
> **Benchmarks**: method and full results are in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md).

---

## Architecture Overview

A redirect doesn't wait on any analytics write. The API answers from Redis and appends the click to a stream; a consumer process does the analytics work later:

```
[ GET /api/r/:shortCode ]
          |
          v
[ Express API ] --HGETALL--> [ Redis: link:meta:{code} ]  (on miss: one MongoDB read, then cache fill)
          |
          +--> HTTP 307 to the destination
          |
          +--> XADD stream:clicks  (after the response; not awaited)
                       |
                       v
          [ Click consumer: XREADGROUP on consumer group "click-consumers" ]
            runs as its own process (WORKER_MODE=separate, `npm run consumer`)
            or inside the API process (WORKER_MODE=embedded)
                       |
                       +--> GeoIP + user-agent parsing + bot flag
                       +--> processed_events ledger (idempotent replays)
                       +--> click_events (time-series), hourly/daily rollups, Link.clicks
                       +--> XACK
```

1. **Redirect path**: a cache hit for a plain link sends exactly two Redis commands (`HGETALL` + `XADD`; pinned by `test/integration/redisCommandBudget.test.js`) and makes no MongoDB calls. Expiry and active status are checked against the cached entry; click caps and password unlocks use their own Redis keys. A cache miss reads MongoDB once and fills the cache. A few cases fire an unawaited MongoDB write after the response: A/B-test links increment the chosen variant's counter, and a link that hits its `maxClicks` cap is deactivated.
2. **Click ingestion**: the click is appended to a capped Redis Stream (`stream:clicks`, `MAXLEN ~ 10000` by default). The consumer reads it through a consumer group in batches of up to 500, enriches each event, writes MongoDB idempotently, and only then acknowledges. Crashed batches are reclaimed with `XAUTOCLAIM`.

---

## Benchmarks

Both benchmarks run on one machine against a local Redis. They measure the application code path, not a production deployment.

### Redirect throughput (`npm run benchmark:redirect`)

Autocannon runs in the same Node process as the API (one process, 100 connections, 10 s) against one short code. The script pre-warms that code's cache entry, so every request is a cache hit. Recorded result (environment and full percentiles in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md#1-high-throughput-redirect-benchmark-autocannon)):

| Metric | Result |
| :--- | :--- |
| Throughput | 6,902 requests/s |
| Latency p50 / p90 / p99 | 11 ms / 23 ms / 48 ms |
| Errors | 0 of 69,017 requests (all HTTP 307) |

### Cache stampede with XFetch (`npm run benchmark:xfetch`)
A herd of concurrent reads hits a hot key. In the baseline the entry has already expired and every request calls the loader (a 35 ms stub for the MongoDB read). With XFetch the entry is near expiry, and the Redis lock lets at most one request refresh it in the background while the rest are served from cache. Mean [min-max] over 5 runs per level; method and caveats in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md#2-xfetch-probabilistic-early-expiration-benchmark):

| Concurrency | Baseline loader calls | XFetch loader calls | DB load saved |
| :--- | :--- | :--- | :--- |
| 10 | 10.0 [10-10] | 1.0 [1-1] | 90.0% |
| 50 | 50.0 [50-50] | 1.0 [1-1] | 98.0% |
| 100 | 100.0 [100-100] | 1.0 [1-1] | 99.0% |
| 250 | 250.0 [250-250] | 1.0 [1-1] | 99.6% |
| 500 | 500.0 [500-500] | 1.0 [1-1] | 99.8% |

---

## Key Engineering Decisions & Tradeoffs

| Decision | Rationale | Tradeoff |
| :--- | :--- | :--- |
| **In-memory access token + HttpOnly refresh cookie** | The 15-minute access JWT lives only in memory (Zustand), never in `localStorage`, so an XSS payload can't read a stored token. The refresh token is an HttpOnly cookie scoped to `/api/auth`, rotated on every use, and a reused token revokes its whole family. | Every page load makes a `/auth/refresh` round trip before the first authenticated call. In production the frontend and API are on different sites, so the cookie is `SameSite=None; Partitioned` (`Strict` in development), and CSRF protection on refresh/logout is an Origin/Referer allowlist check. Refresh families live only in Redis, so losing Redis data logs every user out. |
| **Click ingestion through a Redis Stream** | The redirect responds after one Redis read and appends the click after responding, so analytics writes never sit on the redirect's critical path. | Analytics are eventually consistent: dashboards lag by however far behind the consumer is. The stream is capped (`MAXLEN ~ 10000` by default), so if the consumer falls further behind than that, the oldest unprocessed clicks are trimmed and lost (the consumer logs how many). |
| **Redis Lua sliding-window rate limiter** | One `EVALSHA` evicts old entries, counts and admits in a single atomic step, so concurrent requests on different API instances can't overshoot a limit. Used for login, registration, refresh, link unlock and link creation. | One extra Redis round trip per limited request, and the limiter fails open if Redis is unreachable. The redirect route uses the per-process in-memory limiter instead, to avoid a Redis command per redirect, so that limit applies per instance. |
| **Pre-aggregated hourly and daily rollups** | Dashboards read one rollup document per link per hour or day, updated with `$inc` upserts as clicks are consumed, instead of aggregating raw events per request. | Each breakdown dimension holds 10 to 60 distinct values per document (depending on the dimension); later values go to `__other__`, so a breakdown is "first N seen plus other", not a true top N. Every rollup update also carries a 1,000-ID dedup window. |
| **Feistel-permuted sequence, Base62-encoded** | Short codes come from an atomic MongoDB counter (reserved in blocks of 1,000 per instance), permuted by a 4-round Feistel network over 32 bits and encoded as 6 Base62 characters. Codes are unique without collision retries and don't reveal creation order at a glance. | Depends on the `Counter` collection. Restarts leave gaps in the sequence. The domain is 2^32 (about 4.29 billion codes); past that, values wrap and the unique index on `shortCode` is the backstop. The permutation is obfuscation, not a cryptographic guarantee. |

---

## Quickstart

### Prerequisites
- Node.js 22
- MongoDB 7.0 and Redis 7 (the versions CI tests against)

### Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/PiyushY111/Linkora.git
cd Linkora

# 2. Configure and start the backend
cd backend
cp .env.example .env  # then set MONGODB_URI, JWT_SECRET and REDIS_URL
npm install
npm run dev           # API on http://localhost:5000

# 3. Start the click consumer (second terminal; .env.example sets WORKER_MODE=separate)
cd backend
npm run consumer      # reads stream:clicks

# 4. Start the frontend (third terminal)
cd frontend
npm install
npm run dev           # Vite dev server on http://localhost:3000
```

With `WORKER_MODE=embedded`, step 3 isn't needed: the API process runs the consumer itself.

### Access Points
- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:5000`
- **OpenAPI reference**: `http://localhost:5000/docs` (redirects to `/api/public/v1/docs`)

---

## Features

- **Redirects**:
  - HTTP 307 redirects served from a Redis read-through cache, with negative caching for unknown codes.
  - Per-OS destinations: separate iOS and Android URLs, chosen by user agent.
  - Weighted A/B split between destination URLs, sticky per visitor (hash of IP and user agent).
  - Password-protected links: the password is verified once and exchanged for a 60-second, single-use unlock token, so it never appears in a URL.
- **Analytics**:
  - Hourly and daily rollups; the dashboard offers 24h, 7d, 30d and 90d ranges.
  - Country and city from a local MaxMind GeoLite2 database when `GEOIP_DB_PATH` is set, otherwise from the bundled `geoip-lite` dataset.
  - Browser, OS and device parsing (`ua-parser-js`), and bot flagging by user-agent pattern matching.
  - CSV export of raw click events, streamed row by row (up to 10,000 rows).
- **Developer platform and public API**:
  - API keys with scopes (`links:read`, `links:write`, `links:delete`, `analytics:read`, `webhooks:read`, `webhooks:write`).
  - In-browser `linkora-cli` terminal with tab completion.
  - OpenAPI reference UI at `/docs` (Scalar).
  - Token-bucket rate limit per API key: bursts up to 30 requests, 10 requests/s sustained.
- **Security**:
  - Refresh-token rotation; presenting an already-rotated token revokes the whole token family.
  - SSRF checks on every redirect destination, on create and update, from both the dashboard and public APIs: http(s) only, and the resolved address must not be loopback, RFC 1918, link-local (including `169.254.169.254`) or IPv6 private.
  - Webhook deliveries re-resolve DNS before each attempt and connect to the validated IP (DNS pinning), with redirects disabled.
  - Webhooks signed with HMAC-SHA256 over `timestamp.payload`, sent as `Linkora-Signature: t=...,v1=...`.

---

## Testing

The backend tests use Vitest against real MongoDB and Redis instances (CI runs `mongo:7.0` and `redis:7-alpine` service containers):

```bash
cd backend

# 24 test files (93 tests): unit, security, integration, and a Redis key-TTL hygiene check
npm test

# Tests with a coverage report
npm run test:coverage

# Benchmarks (point REDIS_URL at a local Redis)
npm run benchmark:redirect  # Autocannon redirect load test
npm run benchmark:xfetch    # XFetch cache stampede test
```

### CI Pipeline
Every push and pull request to `main`, `master` or `staging` runs GitHub Actions:
1. Backend: unit, security, integration and Redis key-TTL hygiene tests.
2. Frontend: ESLint, unit tests and a production build.

---

## License

This project is licensed under the [MIT License](LICENSE).
