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
- **Early Recompute Condition**: `-beta * delta * ln(random()) > (expiry - now)`
- **Problem Solved**: Cache stampede (thundering herd) when a hot cache key expires under heavy concurrent load.
- **Reproduce via**: `npm run benchmark:xfetch` (in `backend/`)

### Concurrency Stress Test Results

| Concurrency | Cache Hits | DB Queries Triggered | Stampedes Blocked | DB Load Reduction | Run Duration |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **10 concurrent** | 10 | 1 | 9 | **90.0%** | 2.98s |
| **50 concurrent** | 50 | 0 | 50 | **100.0%** | 1.16s |
| **100 concurrent** | 100 | 0 | 100 | **100.0%** | 1.59s |
| **250 concurrent** | 250 | 0 | 250 | **100.0%** | 2.08s |
| **500 concurrent** | 500 | 1 | 499 | **99.8%** | 3.36s |

**Key Takeaway**:
Under a massive stampede of 500 simultaneous incoming requests for an expiring URL, Linkora's atomic distributed lock admitted **exactly 1 background worker** to query MongoDB and refresh Redis. 499 out of 500 requests (99.8%) were served directly from memory with zero database load penalty.

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
