# Linkora Performance Benchmarks & Verification Report

This document records reproducible, empirical performance benchmarks for Linkora's fast-path redirect engine and distributed caching mechanisms.

---

## 1. High-Throughput Redirect Benchmark (Autocannon)

- **Target Path**: `GET /api/r/:shortCode` (HTTP 307 Temporary Redirect)
- **Harness**: Autocannon 8.0.0 (100 concurrent persistent TCP connections, 10s continuous saturation)
- **Environment**: Node.js 22 LTS, Redis 7.0 (Local in-memory instance)
- **Reproduce via**: `npm run benchmark:redirect` (in `backend/`)

### Results Summary

| Metric | Result |
| :--- | :--- |
| **Total Completed Requests** | **69,017 requests** |
| **Sustained Throughput** | **6,902.4 req/sec** |
| **Network Transfer Rate** | **7.45 MB/sec** |
| **Error Rate / Dropped Connections** | **0.00% (0 errors)** |
| **Successful 307 Redirects** | **69,017 (100.0%)** |

### Latency Percentiles

| Percentile | Latency |
| :--- | :--- |
| **p50 (Median)** | **11 ms** |
| **p75** | **16 ms** |
| **p90** | **23 ms** |
| **p99** | **48 ms** |
| **p99.9** | **94 ms** |
| **Min** | **3 ms** |
| **Max** | **478 ms** |

---

## 2. XFetch Probabilistic Early Expiration Benchmark

- **Algorithm**: Optimal Probabilistic Early Expiration (Vattani, Chierichetti, Lowenstein)
- **Early Recompute Condition**: `-beta * delta * ln(random()) >= (expiry - now)`, with `beta = 1`
- **Problem Solved**: Cache stampede (thundering herd) when a hot cache key expires under heavy concurrent load.
- **Environment**: Apple M3, Node.js 25.2.0, Redis 8.10.2 (local instance)
- **Reproduce via**: `REDIS_URL=redis://127.0.0.1:6379/15 npm run benchmark:xfetch` (in `backend/`). Point `REDIS_URL` at a local database; the script writes and deletes its own keys there.

### Method

For each concurrency level the harness (`backend/scripts/run_xfetch_benchmark.js`) runs two herds of concurrent reads against one key, 5 times each. The cache key and its XFetch lock key are deleted before every herd, so no run inherits a lock or entry from the previous one.

- **Baseline**: the entry has already expired. Every request misses and calls the loader itself (plain cache-aside, no XFetch, no lock).
- **XFetch**: the entry is seeded with 60 ms of TTL left and `delta = 35 ms`. Requests go through `getLinkMeta()`. A request that wins the XFetch lock calls the loader in the background and writes the result back with `setLinkMeta()`. Every request is served the cached entry.

The loader is a stub standing in for the MongoDB read: it sleeps 35 ms and returns the link. "Loader calls" counts its real invocations. "DB load saved" is `1 - mean XFetch loader calls / mean baseline loader calls`. "Herd ms" is the time until every request in the herd has its answer; it doesn't include the XFetch background refresh.

### Results

Values are mean [min-max] over 5 runs.

| Concurrency | Baseline loader calls | XFetch loader calls | XFetch cache hits | DB load saved | Baseline herd ms | XFetch herd ms |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 10 | 10.0 [10-10] | 1.0 [1-1] | 10.0 [10-10] | 90.0% | 38 [36-40] | 1 [1-2] |
| 50 | 50.0 [50-50] | 1.0 [1-1] | 50.0 [50-50] | 98.0% | 46 [42-48] | 6 [5-7] |
| 100 | 100.0 [100-100] | 1.0 [1-1] | 100.0 [100-100] | 99.0% | 49 [46-54] | 7 [5-9] |
| 250 | 250.0 [250-250] | 1.0 [1-1] | 250.0 [250-250] | 99.6% | 53 [49-59] | 13 [11-16] |
| 500 | 500.0 [500-500] | 1.0 [1-1] | 500.0 [500-500] | 99.8% | 54 [50-62] | 15 [14-16] |

### Reading the results

- With the lock, a herd triggers at most one recompute, however many requests pass the XFetch check. Without it, every request in an expired-cache herd goes to the database.
- XFetch is probabilistic, so a herd can also trigger no recompute. With 60 ms left and `delta = 35 ms`, each request triggers with probability about `e^(-60/35) ≈ 0.18` (0.16 measured over 300 single reads). A herd of 10 therefore gets no recompute about 14% of the time (14 of 100 herds in a separate run); every run in the table above happened to get one. Larger herds almost never miss. When no request triggers, the entry keeps serving until it expires, and the next read after that is an ordinary cache miss.
- The benchmark measures a single hot key on a local Redis. It does not measure MongoDB itself or network latency to a remote Redis.

---

## 3. Automated Test Suite & Coverage

- **Engine**: Vitest 4.1.11 with V8 Coverage Provider
- **Execution**: 24 test suites across unit, security, integration, and redis-hygiene projects
- **Status**: **91 passed / 91 total tests (100% passing)**

| Area | Statement Coverage | Line Coverage | Function Coverage |
| :--- | :--- | :--- | :--- |
| **Analytics Repository & Rollups** | 90.97% | 92.40% | 92.59% |
| **Core Models & Schemas** | 87.50% | 87.32% | 66.66% |
| **Route Gateways & Auth Filters** | 91.42% | 91.34% | 83.33% |
| **Core App & Error Handlers** | 83.05% | 84.21% | 83.33% |
| **Security (CSRF, SSO, Refresh, SSRF)** | 90.90% | 88.88% | 100.0% |
