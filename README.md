# Linkora: High-Throughput Distributed URL Redirection & Analytics Engine

[![CI Pipeline](https://img.shields.io/github/actions/workflow/status/PiyushY111/Linkora/ci.yml?branch=main&style=flat-square&label=CI%20Pipeline)](https://github.com/PiyushY111/Linkora/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Test Coverage](https://img.shields.io/badge/Test%20Coverage-91%20Tests%20Passing-brightgreen.svg?style=flat-square)](docs/BENCHMARKS.md)
[![Throughput](https://img.shields.io/badge/Redirect%20Throughput-6%2C902%20req%2Fs-blueviolet.svg?style=flat-square)](docs/BENCHMARKS.md)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248.svg?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-7.0-DC382D.svg?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)

Linkora is an enterprise-grade, distributed URL redirection engine and real-time click intelligence platform engineered for high-concurrency workloads. It combines **sub-15ms fast-path redirection**, **dual-path ingestion via Redis streams**, **pre-aggregated multi-tiered analytics**, **zero-trust token security**, and an **SSRF-hardened webhook pipeline**.

> 📖 **Deep Technical Architecture**: For the exhaustive distributed systems whitepaper, idempotency ledgers, and Redis key space specifications, see [**`docs/ARCHITECTURE.md`**](docs/ARCHITECTURE.md).  
> 📊 **Empirical Performance Data**: For load testing methodology and XFetch reproduction logs, see [**`docs/BENCHMARKS.md`**](docs/BENCHMARKS.md).

---

## 30-Second Architecture Overview

Standard shorteners collapse under flash crowds because every redirect performs synchronous database writes to update hit counts. Linkora completely decouples redirect execution from analytics persistence:

```
[ Inbound Click ] ---> [ Express Edge Gateway ]
                             |
         +-------------------+-------------------+
         | (1. Memory Fast-Path: <15ms)          | (2. Asynchronous Ingestion)
         v                                       v
[ Redis L1/L2 Cache ]                    [ Redis Stream (stream:clicks) ]
         |                                       |
         +---> HTTP 307 Redirect                 v
               (0 DB disk writes)         [ Click Consumer Fleet ]
                                                 |
                                                 +---> GeoIP & Bot Classification
                                                 +---> Exactly-Once Deduplication Ledger
                                                 +---> Micro-Batch Rollups (MongoDB)
```

1. **Fast-Path Resolution**: Serves cached redirects from Redis in **11ms median latency**, validates link expiration and passwords in memory, and returns an HTTP 307 with zero database disk I/O.
2. **Asynchronous Stream Ingestion**: Emits click telemetry to a capped Redis Stream (`stream:clicks`). A dedicated consumer fleet enriches events with GeoIP data and writes micro-batch rollups to MongoDB.

---

## Verifiable Performance Benchmarks

Empirical load test metrics measured using `autocannon` (100 concurrent TCP connections) and an in-memory Redis cache:

| Metric | Result | Benchmark Source |
| :--- | :--- | :--- |
| **Redirect Throughput** | **6,902.4 requests/second** | `npm run benchmark:redirect` |
| **p50 Latency (Median)** | **11 ms** | Autocannon 8.0.0 (10s run) |
| **p90 Latency** | **23 ms** | Autocannon 8.0.0 (10s run) |
| **p99 Latency** | **48 ms** | Autocannon 8.0.0 (10s run) |
| **Error Rate** | **0.00% (0 errors / 69,017 requests)** | 100% successful HTTP 307 |
| **Cache Stampede Defense** | **99.8% fewer loader calls at 500 concurrent reads** | `npm run benchmark:xfetch` |

### XFetch Cache Stampede Prevention Under Load
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

| Decision | Rationale | Engineering Tradeoff |
| :--- | :--- | :--- |
| **In-Memory Access Token + HttpOnly Refresh Cookie** | Storing JWTs in `localStorage` exposes them to XSS exfiltration. Linkora holds the access token strictly in memory (Zustand) and silent-refreshes on load via a `SameSite=Strict` HttpOnly cookie. | Requires a silent `/auth/refresh` round-trip on initial app load, handled seamlessly during the initial page bootstrap. |
| **Dual-Path Ingestion (Redis Streams)** | Decouples redirection latency from analytics storage. Prevents disk saturation during sudden traffic spikes (e.g. viral campaigns). | Click analytics are eventually consistent (typically ~500ms delay between redirect and dashboard rollup). |
| **Redis Atomic Lua Sliding Window** | Eliminates distributed race conditions across horizontal API instances while enforcing atomic sliding-window rate limits. | Adds a small sub-millisecond Redis round-trip per rate-limited ingress request. |
| **Pre-Aggregated Hourly & Daily Rollups** | Executing `$group` aggregations over millions of raw click records causes high CPU spikes. Linkora pre-computes hourly and daily buckets upon stream consumption. | Write logic in consumer is more complex, requiring dimension capping (20 categories max) to prevent document growth. |
| **Feistel Cipher Base62 Encoding** | Random slugs suffer from the Birthday Paradox (hash collisions at scale), while sequential auto-increments expose business metrics to competitors. Linkora permutes monotonic integers via a Feistel block cipher before Base62 encoding. | Requires maintaining an atomic MongoDB sequence counter (`Counter` collection). |

---

## Quickstart

### Prerequisites
- Node.js 22 LTS
- MongoDB 7.0 & Redis 7.0

### Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/PiyushY111/Linkora.git
cd Linkora

# 2. Configure & Start Backend
cd backend
cp .env.example .env
npm install
npm run dev           # Runs API Gateway on http://localhost:5000

# 3. Start Asynchronous Click Consumer (in a second terminal)
cd backend
npm run consumer      # Runs stream worker processing stream:clicks

# 4. Start Frontend Dashboard (in a third terminal)
cd frontend
npm install
npm run dev           # Runs Vite dev server on http://localhost:3000
```

### Access Points
- **Frontend Dashboard**: `http://localhost:3000`
- **Backend REST API**: `http://localhost:5000`
- **Interactive OpenAPI Reference**: `http://localhost:5000/docs`

---

## Feature Matrix

- **High-Throughput Redirection**:
  - Direct 307 redirection with in-memory TTL caching.
  - OS-targeted routing (iOS App Store / Android Play Store deep-links).
  - Weighted A/B split testing between multiple destination URLs.
  - Password-gated link unlocking with single-use JWT access tokens.
- **Analytics & Telemetry**:
  - High-resolution hourly (24h) and daily (30d) rollup analytics.
  - Geolocation tracking (Country, City via MaxMind GeoLite2).
  - Browser, OS, and device classification with algorithmic bot filtering.
  - Granular CSV export streamed via Node.js pipeline.
- **Developer Platform & Public API**:
  - Scoped API key management (`links:read`, `links:write`, `analytics:read`).
  - Interactive **In-Browser Terminal CLI (`linkora-cli`)** with auto-completion.
  - Interactive **OpenAPI Reference Explorer** at `/docs` (via Scalar).
  - Token-bucket rate limiting allowing short burst traffic.
- **Security & Zero-Trust**:
  - Full refresh token rotation with single-use family invalidation upon replay detection.
  - Multi-layer SSRF filter blocking RFC 1918 private subnets and cloud metadata endpoints (`169.254.169.254`).
  - Webhook delivery pipeline with DNS-pinned dispatchers and Opossum circuit breakers.
  - Cryptographic HMAC-SHA256 signatures on outbound webhooks (`x-linkora-signature`).

---

## Automated Testing & Code Quality

The backend test suite is powered by **Vitest** and runs against real MongoDB and Redis instances to guarantee production parity:

```bash
cd backend

# Run all 24 test suites (91 integration & security tests)
npm test

# Run tests with code coverage report
npm run test:coverage

# Run reproducible performance benchmarks
npm run benchmark:redirect  # Autocannon redirect load test
npm run benchmark:xfetch    # XFetch cache stampede test
```

### CI Pipeline
Every push and pull request runs automated GitHub Actions checking:
1. Backend unit, security, integration, and Redis key TTL hygiene tests.
2. Frontend unit tests, ESLint linting pass, and production bundle builds.

---

## License

This project is open-source software licensed under the [**MIT License**](LICENSE).
