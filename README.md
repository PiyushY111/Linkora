# Linkora: High-Throughput Distributed URL Redirection & Analytics Engine

[![Build Status](https://img.shields.io/github/actions/workflow/status/PiyushY111/Linkora/ci.yml?branch=main&style=flat-square&label=CI%20Pipeline)](https://github.com/PiyushY111/Linkora/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248.svg?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-7.0-DC382D.svg?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)

Linkora is an enterprise-grade, distributed URL redirection engine and programmatic click intelligence platform designed for high throughput, sub-millisecond edge resolution, and bounded-memory aggregation. The system implements dual-path event ingestion, asynchronous Redis stream processing, multi-tiered rollup analytics on MongoDB, zero-trust token rotation, and an SSRF-hardened webhook delivery pipeline with circuit breakers.

---

## Table of Contents

- [1. Executive System Architecture](#1-executive-system-architecture)
- [2. Distributed Systems Design & Core Patterns](#2-distributed-systems-design--core-patterns)
  - [2.1 Write Amplification Mitigation & Dual-Path Ingestion](#21-write-amplification-mitigation--dual-path-ingestion)
  - [2.2 Stream Processing & Exactly-Once Idempotency Ledger](#22-stream-processing--exactly-once-idempotency-ledger)
  - [2.3 Pre-Aggregated Rollups & Cardinality Bounding](#23-pre-aggregated-rollups--cardinality-bounding)
  - [2.4 Probabilistic Early Expiration (XFetch) Cache Defense](#24-probabilistic-early-expiration-xfetch-cache-defense)
  - [2.5 Collision-Resilient Monotonic Base62 Sequence Generation](#25-collision-resilient-monotonic-base62-sequence-generation)
- [3. Complete Database & Persistence Schema](#3-complete-database--persistence-schema)
  - [3.1 MongoDB Collections Specification](#31-mongodb-collections-specification)
  - [3.2 Redis In-Memory Key Space Architecture](#32-redis-in-memory-key-space-architecture)
- [4. Security, Zero-Trust Architecture & Threat Modeling](#4-security-zero-trust-architecture--threat-modeling)
  - [4.1 Refresh Token Rotation & Token Family Revocation](#41-refresh-token-rotation--token-family-revocation)
  - [4.2 Partitioned Cross-Origin Cookies (CHIPS)](#42-partitioned-cross-origin-cookies-chips)
  - [4.3 Multi-Layer SSRF Defense Engine](#43-multi-layer-ssrf-defense-engine)
  - [4.4 Cryptographic Webhook Signing & Circuit Breakers](#44-cryptographic-webhook-signing--circuit-breakers)
  - [4.5 Reverse-Proxy Keyed Token-Bucket Rate Limiter](#45-reverse-proxy-keyed-token-bucket-rate-limiter)
- [5. Public API Specification & Developer CLI](#5-public-api-specification--developer-cli)
- [6. Deployment Topologies & Operational Runbooks](#6-deployment-topologies--operational-runbooks)
- [7. Automated Testing & Verification Pipeline](#7-automated-testing--verification-pipeline)

---

## 1. Executive System Architecture

The following diagram illustrates the complete end-to-end data flow across client requests, reverse proxy edge termination, caching layers, asynchronous stream processing, and multi-tier persistent storage:

```
[ Inbound HTTP Traffic ]
           |
           v
+------------------------------------------------------------------------+
| 1. EDGE & REVERSE PROXY LAYER (Cloudflare / Vercel / Render)          |
|    - SSL/TLS Termination                                               |
|    - Client IP Header Normalization (CF-Connecting-IP, X-Real-IP)      |
|    - Edge Caching of Static Assets & CORS Preflight Handling           |
+------------------------------------------------------------------------+
                                   |
                                   v
+------------------------------------------------------------------------+
| 2. API GATEWAY & SECURITY INGRESS (Express ESM / Node 22 LTS)          |
|    - Helmet HTTP Security Headers (Strict CSP, HSTS, Sniff Prevention) |
|    - IP-Keyed Token-Bucket Rate Limiter (Sliding Window in Redis)      |
|    - CSRF Protection & Origin Validation for State-Mutating Routes     |
|    - JWT Access Token Verification & Scoped API Key Authenticator      |
+------------------------------------------------------------------------+
         |                                           |
  (Redirect Route)                            (API / Admin Routes)
         |                                           |
         v                                           v
+-----------------------+                 +------------------------------+
| 3. REDIRECT ENGINE    |                 | 4. CORE CONTROLLERS          |
| - Fast Path Resolution|                 | - Link Provisioning & CRUD   |
| - Device OS Routing   |                 | - Auth / Token Lifecycle     |
| - A/B Split Engine    |                 | - Webhook Registration       |
+-----------------------+                 | - Analytics Query Gateway    |
         |                                +------------------------------+
         |                                           |
         +-------------------+   +-------------------+
                             |   |
                             v   v
+------------------------------------------------------------------------+
| 5. IN-MEMORY CACHING & BUFFERING TIER (Redis 7.0)                      |
|    - link:meta:<shortCode>    -> Serialized Link Metadata (TTL 1h)     |
|    - link:usage:<linkId>      -> Atomic In-Memory Hit Counter          |
|    - ratelimit:<ip>           -> Sliding Window Token Bucket Keys      |
|    - refresh:family:<id>      -> Cryptographic Refresh Token Chains    |
|    - stream:clicks            -> Capped Append-Only Stream (MAXLEN 10k)|
+------------------------------------------------------------------------+
         |                                           |
   (Cache Miss)                                (XADD stream:clicks)
         |                                           |
         v                                           v
+-----------------------+                 +------------------------------+
| 6. PRIMARY DATA STORE |                 | 7. ASYNC CONSUMER WORKER     |
|    (MongoDB 7.0)      |                 | - XREADGROUP Consumer Fleet  |
| - Strict Tenant Scope |                 | - Deduplication Ledger Check |
| - Atomic Counters     |                 | - IP Geo & Device Parsing    |
| - Links & Users       |                 | - Batch Pipeline Flush       |
+-----------------------+                 +------------------------------+
                                                     |
                         +---------------------------+---------------------------+
                         |                                                       |
                         v                                                       v
+-------------------------------------------------+     +----------------------------------+
| 8. ANALYTICS STORAGE SUBSYSTEM                  |     | 9. WEBHOOK DISPATCH SUBSYSTEM    |
| - click_events: MongoDB Time-Series Collection  |     | - SSRF Filter (RFC 1918 Block)   |
| - link_stats_hourly: Pre-aggregated Hour Buckets|     | - Opossum Circuit Breakers       |
| - link_stats_daily: Daily Buckets (HyperLogLog) |     | - HMAC-SHA256 Payload Signature  |
| - processed_events: Distributed Idempotency Log |     | - Exponential Backoff with DLQ   |
+-------------------------------------------------+     +----------------------------------+
```

---

## 2. Distributed Systems Design & Core Patterns

### 2.1 Write Amplification Mitigation & Dual-Path Ingestion

Standard URL shorteners commit a relational or document write on every inbound redirect to update click counts and log visitor telemetry. Under flash crowds (e.g. 50,000 requests per second), this architecture rapidly collapses due to disk IOPS saturation, connection pool exhaustion, and lock contention on the hot link record.

Linkora decouples redirection latency from analytical telemetry via a **Dual-Path Ingestion Architecture**:

1. **Synchronous Fast Path (Redirection Path)**:
   - Request enters `GET /:shortCode`.
   - Redis L1 cache is probed via `GET cache:link:{shortCode}`.
   - If hit, password requirements, usage caps, and expiration timestamps are validated entirely in memory.
   - Active device targeting (iOS deep links vs Android intents) or weighted A/B variant selections are evaluated in sub-millisecond compute.
   - An event payload containing raw metadata (timestamp, IP, user-agent, referer, link ID) is dispatched asynchronously to the Redis stream via `XADD stream:clicks MAXLEN ~ 100000 * ...`.
   - HTTP `302 Found` or `301 Moved Permanently` is immediately returned to the client. The client connection terminates with zero database disk I/O.

2. **Asynchronous Ingestion Path (Worker Fleet)**:
   - Dedicated worker processes (or in-process embedded consumers) poll `stream:clicks` using Redis consumer groups (`XREADGROUP GROUP click_consumers ...`).
   - Batches of up to 100 click events are processed in micro-batches, enriching the raw events with GeoIP lookups, device signatures, and bot classification heuristics.
   - Batches are written to MongoDB using atomic bulk operations (`bulkWrite`), consolidating 100 distinct write operations into a single network round-trip.

### 2.2 Stream Processing & Exactly-Once Idempotency Ledger

When operating distributed stream consumers, node failures or network partitions can trigger worker restarts while batches are in flight. To prevent over-counting clicks and duplicating telemetry, Linkora employs a **Two-Tier Idempotency Mechanism**:

```
[ Stream Entry (eventId: 1727161200000-0) ]
                      |
                      v
       [ ProcessedEvent Ledger Check ]
       Does _id == eventId exist in state 'done'?
             /                 \
          (Yes)                (No)
           /                     \
   [ Skip Event ]          [ Write Ahead: state 'pending' ]
   Already applied                 |
                                   v
                       [ Atomic Rollup Updates ]
                       - $inc link_stats_hourly
                       - $inc link_stats_daily
                       - $push appliedClickIds (bounded)
                                   |
                                   v
                       [ Commit Time-Series Event ]
                       - insert click_events
                                   |
                                   v
                       [ Mark Ledger state 'done' ]
                                   |
                                   v
                       [ XACK stream:clicks ]
```

1. **Write-Ahead Ledger (`processed_events`)**:
   - Every stream message has a deterministic Redis Stream Entry ID (e.g., `1727161200000-0`).
   - Before executing bulk state transformations, the consumer registers the event IDs in the `processed_events` collection with a state of `pending`.
   - If an entry already exists with `state: 'done'`, the event is acknowledged immediately via `XACK` and bypassed without re-applying metric increments.

2. **Sliding-Window Document Deduplication (`appliedClickIds`)**:
   - The primary `Link` document retains a circular array of the most recent event IDs (`appliedClickIds`).
   - Link counter increments execute conditionally:
     ```javascript
     await Link.updateOne(
       { _id: linkId, appliedClickIds: { $ne: eventId } },
       {
         $inc: { clicks: 1 },
         $push: { appliedClickIds: { $each: [eventId], $slice: -100 } }
       }
     );
     ```
   - If an event is redelivered via `XAUTOCLAIM` following an ungraceful consumer crash, the database update acts as a no-op, guaranteeing exact count precision.

### 2.3 Pre-Aggregated Rollups & Cardinality Bounding

Querying millions of raw time-series documents using runtime aggregation pipelines (`$group`, `$match`, `$unwind`) causes unacceptable latency spikes and memory consumption on production analytical dashboards.

Linkora eliminates runtime aggregation latency by pre-computing rollups during stream consumption into two bounded collections:
- `link_stats_hourly`: Hourly rollup buckets for high-resolution short-term telemetry (7-day retention).
- `link_stats_daily`: Daily rollup buckets for long-term historical reporting (unbounded retention).

#### Dimensionality Capping (Protection against Unbounded Document Growth)
To prevent BSON document size overflow (16MB MongoDB limit) caused by high-cardinality referrers or user agents, Linkora enforces **Dimension Capping**:
- Each dimensional category (browsers, devices, operating systems, countries, referrers) maintains a maximum of 20 unique keys per bucket document.
- When inbound events exceed the 20-key threshold, the consumer automatically routes overflow metrics into a designated `other` key.
- Each dimension tracks both total interactions (`a`) and human-verified traffic (`h`), allowing instant bot-filtering without separate collection scans.

### 2.4 Probabilistic Early Expiration (XFetch) Cache Defense

In high-concurrency systems, standard TTL-based cache expiration triggers the **Cache Stampede (Thundering Herd)** problem: the exact second a hot cache key expires, thousands of concurrent requests miss cache simultaneously and execute redundant database reads, saturating the database.

Linkora implements the **XFetch Probabilistic Early Recomputation Algorithm**:

$$\Delta t - \beta \cdot \ln(rand()) > \text{TTL}$$

Where:
- $\Delta t$: Computation time required to build the cache entry.
- $\beta$: Eagerness parameter ($\beta > 0$, default `1.0`).
- $rand()$: Uniformly distributed pseudo-random float $\in (0, 1]$.
- $\text{TTL}$: Remaining time-to-live of the cached key.

As the remaining TTL decreases, the probability of background cache recomputation increases. A single worker thread transparently refreshes the cache asynchronously before expiration occurs, ensuring that incoming reader requests experience a 100% cache hit rate with zero database thundering herds.

### 2.5 Collision-Resilient Monotonic Base62 Sequence Generation

Many URL shorteners rely on random string generation (e.g. `crypto.randomBytes(4)`), which suffers from the **Birthday Paradox**: collision probabilities escalate rapidly as dataset sizes scale past several million records, requiring expensive retry loops and unique index checks.

Linkora guarantees collision-free short codes using a **Monotonic Distributed Sequence Generator**:
- Sequences are driven by an atomic MongoDB counter (`Counter` collection) utilizing `findOneAndUpdate` with `$inc`.
- Numeric counters are encoded into **Base62 strings** using the alphabet `[0-9a-zA-Z]`.
- A 7-character Base62 string provides $62^7 \approx 3.52 \times 10^{12}$ (3.52 trillion) unique addressable URLs.
- The counter sequence strictly avoids Redis storage because Redis is treated as an evictable cache; an unexpected cache flush or memory eviction could reset the sequence and cause critical key collisions.

---

## 3. Complete Database & Persistence Schema

### 3.1 MongoDB Collections Specification

#### 1. Collection: `links`
Stores core shortened link configurations, security controls, and routing directives.

| Field | Type | Modifiers / Constraints | Description |
|---|---|---|---|
| `_id` | `ObjectId` | Primary Key, Auto-generated | Unique internal identifier |
| `user` | `ObjectId` | Required, Ref: `User`, Indexed | Owner identifier for multi-tenant isolation |
| `originalUrl` | `String` | Required, Trimmed | Destination target URL |
| `shortCode` | `String` | Required, Unique, Case-sensitive | Base62 unique slug or custom alias |
| `shortUrl` | `String` | Required, Unique | Fully qualified public redirect URL |
| `customAlias` | `String` | Sparse Index, Unique | User-defined custom vanity slug |
| `title` | `String` | Max length: 200 | User-defined title for administrative search |
| `category` | `String` | Enum: `business`, `personal`, `social`, `marketing`, `other` | Categorical classification |
| `password` | `String` | Bcrypt Hash (`$2a$10$...`) | Optional passcode required for redirection |
| `maxClicks` | `Number` | Nullable, Default: `null` | Threshold cap to automatically deactivate link |
| `clicks` | `Number` | Default: `0`, Indexed | Authoritative total interaction counter |
| `isActive` | `Boolean` | Default: `true`, Indexed | Administrative kill-switch status |
| `abuseFlag` | `Boolean` | Default: `false` | System flag indicating security review |
| `expiryDate` | `Date` | Nullable, Indexed | Explicit timestamp after which link rejects traffic |
| `routingType` | `String` | Enum: `direct`, `ab_test` | Routing strategy algorithm |
| `variants` | `Array<Object>` | Embedded Subdocuments | Weighted destination URLs for A/B traffic split |
| `iosRedirect` | `String` | Nullable | Deep-link target for Apple iOS visitors |
| `androidRedirect` | `String` | Nullable | Deep-link target for Android OS visitors |
| `appliedClickIds`| `Array<String>` | Private (`select: false`), Bounded (100) | Circular sliding window of processed event IDs |
| `createdAt` | `Date` | Timestamp | Creation timestamp |
| `updatedAt` | `Date` | Timestamp | Modification timestamp |

**Indexes**:
- `{ shortCode: 1 }` (Unique, Primary fast-path redirect lookup)
- `{ customAlias: 1 }` (Unique, Sparse)
- `{ user: 1, createdAt: -1 }` (Compound, Tenant-scoped dashboard pagination)
- `{ user: 1, isActive: 1 }` (Compound, Tenant active link querying)

---

#### 2. Collection: `click_events` (MongoDB Time-Series)
Stores raw granular telemetry for deep audits, CSV streaming, and real-time feeds.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `timestamp` | `Date` | TimeField, Granularity: `seconds` | Exact UTC timestamp of click |
| `meta.linkId` | `ObjectId` | MetaField, Required | Targeted link identifier |
| `meta.userId` | `ObjectId` | MetaField, Nullable | Tenant identifier for global account audits |
| `eventId` | `String` | Required, Indexed | Source Redis Stream entry ID |
| `shortCode` | `String` | Indexed | Link short slug |
| `ip` | `String` | Anonymized / Masked | Cleaned IP address (respects privacy toggle) |
| `ipHash` | `String` | SHA-256 HMAC | One-way hash for distinct visitor calculation |
| `country` | `String` | ISO 3166-1 alpha-2 | Geolocation country code |
| `city` | `String` | Plain text | Geolocation city name |
| `device` | `String` | Categorical | `desktop`, `mobile`, `tablet` |
| `browser` | `String` | Plain text | Browser engine (e.g. `Chrome`, `Safari`) |
| `os` | `String` | Plain text | Operating system (e.g. `iOS`, `macOS`, `Windows`)|
| `referrerDomain`| `String` | Normalized hostname | Inbound referrer domain |
| `isBot` | `Boolean` | Default: `false` | Algorithmic bot detection flag |
| `botName` | `String` | Nullable | Identified bot spider signature |

**Indexes & Storage Mechanics**:
- Time-series cluster options: `timeField: "timestamp"`, `metaField: "meta"`, `granularity: "seconds"`.
- TTL Automatic Expiry: `expireAfterSeconds: CLICK_EVENT_RETENTION_DAYS * 86400` (Default: 90 days).
- Compound Index: `{ "meta.linkId": 1, timestamp: -1 }`.
- Compound Index: `{ "meta.userId": 1, timestamp: -1 }`.

---

#### 3. Collection: `link_stats_hourly` & `link_stats_daily`
Pre-aggregated rollups maintaining constant O(1) query time regardless of traffic volume.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `linkId` | `ObjectId` | Required, Compound Index | Reference to targeted `Link` |
| `userId` | `ObjectId` | Indexed | Reference to parent `User` |
| `bucket` | `Date` | Required, Compound Index | Truncated time interval (start of hour / day) |
| `total` | `Number` | Default: `0` | Total click interactions within bucket |
| `human` | `Number` | Default: `0` | Human-only click interactions |
| `bot` | `Number` | Default: `0` | Bot / Crawler interactions |
| `unique` | `Number` | Default: `0` | HyperLogLog approximated unique visitors |
| `dims` | `Mixed` | Bounded Sub-maps | Multi-dimensional metrics (`dims.<category>.<val>`)|
| `appliedIds` | `Array<String>` | Private, Excluded from reads | Deduplication tracking window |

**Dimension Map Schema (`dims`)**:
```json
{
  "browser": {
    "Chrome": { "a": 1240, "h": 1200 },
    "Safari": { "a": 890, "h": 880 }
  },
  "country": {
    "US": { "a": 1500, "h": 1450 },
    "IN": { "a": 630, "h": 630 }
  },
  "device": {
    "mobile": { "a": 1300, "h": 1290 },
    "desktop": { "a": 830, "h": 790 }
  }
}
```

**Indexes**:
- `{ linkId: 1, bucket: 1 }` (Compound, Unique constraint for upsert idempotency)
- `{ userId: 1, bucket: 1 }` (Compound, Account-level global summary rollups)
- `{ bucket: 1 }` (TTL expiration on hourly collection)

---

#### 4. Collection: `processed_events`
Distributed write-ahead ledger guaranteeing exactly-once semantics for worker clusters.

| Field | Type | Modifiers | Description |
|---|---|---|---|
| `_id` | `String` | Primary Key | Redis Stream Entry ID (`<timestamp>-<seq>`) |
| `state` | `String` | Enum: `pending`, `done` | Current processing state of the event batch |
| `createdAt` | `Date` | Required, TTL Index | Insertion timestamp (Expires after 3 days) |

**Indexes**:
- `{ createdAt: 1 }` (`expireAfterSeconds: 259200` — 3-day automatic garbage collection)

---

#### 5. Collection: `webhooks` & `webhook_deliveries`
Event-driven webhook registration and transactional delivery audit records.

```
[ Webhook Subscription ]
  _id: ObjectId
  user: ObjectId (Indexed)
  url: String
  secret: String (Shared secret for HMAC-SHA256)
  events: Array<String> ['link.clicked', 'link.created', ...]
  isActive: Boolean
  consecutiveFailures: Number
  circuitBreakerState: 'closed' | 'open' | 'half-open'
         |
         | (1:N Dispatches)
         v
[ Webhook Delivery Audit ]
  _id: ObjectId
  webhook: ObjectId (Indexed)
  event: String
  status: 'success' | 'failed' | 'retrying'
  responseStatus: Number (e.g. 200, 500)
  requestPayload: Object
  responseBody: String
  latencyMs: Number
  attempt: Number (Max: 5)
  nextRetryAt: Date (Indexed for retry scheduler)
```

---

### 3.2 Redis In-Memory Key Space Architecture

Linkora structures its Redis key space using explicit domain prefixes, deterministic TTLs, and bounded memory limits:

| Key Pattern | Data Structure | TTL Policy | Memory Policy | Purpose |
|---|---|---|---|---|
| `cache:link:{shortCode}` | `String` (JSON) | 3600s + Jitter | Ephemeral Cache | Hot-path cached link redirect metadata |
| `link:usage:{linkId}` | `Integer` | None / Managed | Evictable Counter | Atomic in-memory hit tracking for fast cap checks |
| `stream:clicks` | `Stream` | Capped via `MAXLEN` | Ring-buffer buffer | High-throughput async ingestion queue |
| `ratelimit:{ip}` | `Hash` | Window duration | Auto-expiring | Sliding-window token-bucket IP quota |
| `ratelimit:api:{keyHash}` | `Hash` | 60s window | Auto-expiring | Scoped API Key token-bucket limiter |
| `refresh:family:{id}:curr` | `String` | 30 Days | Volatile TTL | Active refresh token in cryptographic rotation chain |
| `refresh:family:{id}:user` | `String` | 30 Days | Volatile TTL | User ownership verification for token family |
| `worker:lock:{name}` | `String` | 30s Heartbeat | Distributed Lock | Leader election for cron jobs & rollup flushes |

---

## 4. Security, Zero-Trust Architecture & Threat Modeling

### 4.1 Refresh Token Rotation & Token Family Revocation

Linkora strictly adheres to the RFC 6749 OAuth 2.0 security specifications to guard against token theft and session hijacking:

```
[ Client Request ]
       |
       | POST /api/auth/refresh (Cookie: refreshToken=R1, familyId=F1)
       v
+-------------------------------------------------------------+
| REDIS TOKEN FAMILY VALIDATOR                                |
| 1. Query refresh:family:F1:curr                             |
| 2. Compare R1 with stored active token                       |
+-------------------------------------------------------------+
              /                                     \
    (Match: Valid Rotation)                  (Mismatch: Token Reuse Attack!)
            /                                         \
+------------------------------------+   +------------------------------------+
| 1. Generate new token R2           |   | 1. INSTANT REVOCATION:             |
| 2. Set refresh:family:F1:curr = R2 |   |    Delete refresh:family:F1:*      |
| 3. Issue new Access Token (JWT)    |   | 2. Clear Client HTTP Cookies       |
| 4. Set HttpOnly Cookie (R2)        |   | 3. Return 401 Unauthorized         |
+------------------------------------+   +------------------------------------+
```

- **Reuse Detection**: If a compromised refresh token is presented after having already been rotated, Linkora flags a replay attack, instantly destroys the entire token family, and forces all active sessions for that family to re-authenticate.

### 4.2 Partitioned Cross-Origin Cookies (CHIPS)

To support decoupled architectures (e.g. Next.js/Vite frontend hosted on Vercel communicating with an API cluster on Render/Railway), Linkora implements **Cookies Having Independent Partitioned State (CHIPS)**:

```javascript
res.cookie('refreshToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  partitioned: true, // CHIPS partition opt-in
  maxAge: 30 * 24 * 60 * 60 * 1000,
});
```
This guarantees cross-domain cookie delivery without vulnerability to cross-site tracking deprecations in modern Chromium and WebKit rendering engines.

### 4.3 Multi-Layer SSRF Defense Engine

When users register destination links or webhook endpoints, malicious actors may attempt to probe internal infrastructure or cloud metadata services. Linkora enforces deep validation prior to dispatching outbound HTTP traffic:

```
[ Inbound Target URL: http://169.254.169.254/latest/meta-data ]
                            |
                            v
+-------------------------------------------------------------+
| 1. PROTOCOL VALIDATION                                      |
|    - Strictly require http: or https:                       |
+-------------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------------+
| 2. ASYNC DNS RESOLUTION                                     |
|    - Resolve target hostname to physical IP addresses       |
+-------------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------------+
| 3. CIDR & PRIVATE SUBNET SCREENING                          |
|    - Block 127.0.0.0/8 & ::1            (Loopback)          |
|    - Block 10.0.0.0/8                   (RFC 1918 Class A)  |
|    - Block 172.16.0.0/12                (RFC 1918 Class B)  |
|    - Block 192.168.0.0/16               (RFC 1918 Class C)  |
|    - Block 169.254.0.0/16               (Link-Local Cloud)  |
+-------------------------------------------------------------+
              /                                     \
    (Blacklisted IP)                              (Clean IP)
            /                                         \
    [ REJECT REQUEST ]                           [ DISPATCH HTTP ]
    400 Invalid Destination                     (Disable Redirects)
```

- **Non-Redirect Guarantee**: Outbound HTTP dispatchers (via `undici` / custom fetch) configure `maxRedirections: 0`. Webhook targets cannot return a 302 redirecting to an internal loopback address to bypass initial checks.

### 4.4 Cryptographic Webhook Signing & Circuit Breakers

Every outbound webhook delivery is verified through a cryptographically secure signature sent via the `x-linkora-signature` header:

$$\text{Signature} = \text{HMAC-SHA256}(\text{secret}, \text{timestamp} \cdot \text{payload})$$

```http
x-linkora-signature: t=1727161200,v1=5d41402abc4b2a76b9719d911017c592
```

- **Replay Protection**: Receivers verify that $|t_{\text{current}} - t_{\text{header}}| \le 300\text{ seconds}$.
- **Circuit Breaker Integration**: Outbound dispatches are wrapped in an **Opossum Circuit Breaker**. If an external webhook receiver fails 5 consecutive times (timeouts or 5xx status), the breaker opens, halting further dispatches to protect backend connection sockets.
- **Dead Letter Queue (DLQ)**: Failed dispatches retry across exponential intervals (`1m`, `5m`, `30m`, `2h`, `5h`). If all retries are exhausted, the delivery record transitions to `failed` and logs to the dead-letter drawer for manual payload replay.

### 4.5 Reverse-Proxy Keyed Token-Bucket Rate Limiter

Traditional Express rate limiters group requests by `req.ip`. Behind cloud load balancers or CDNs, `req.ip` defaults to the internal proxy IP, inadvertently throttling the entire user base simultaneously.

Linkora utilizes an intelligent IP extraction engine:
1. Inspects `CF-Connecting-IP` (Cloudflare authoritative client IP).
2. Falls back to `X-Real-IP`.
3. Evaluates first non-private client IP in `X-Forwarded-For`.
4. Applies Redis token-bucket sliding windows keyed per genuine client IP, preventing cross-tenant throttling.

---

## 5. Public API Specification & Developer CLI

Linkora provides a developer-first Public API authenticated via scoped keys:

```http
x-api-key: lnk_live_382a91b...
```

### Core API Endpoints

| Method | Endpoint | Required Scope | Description |
|---|---|---|---|
| `GET` | `/api/public/v1/openapi.json` | None | OpenAPI 3.1.0 JSON machine-readable spec |
| `GET` | `/api/public/v1/usage` | Valid Key | Inspect current key scopes and token bucket limits |
| `GET` | `/api/public/v1/links` | `links:read` | List paginated short links with metadata |
| `POST` | `/api/public/v1/links` | `links:write` | Provision a new shortened destination link |
| `GET` | `/api/public/v1/links/:code`| `links:read` | Retrieve metadata and state for a short link |
| `PATCH`| `/api/public/v1/links/:code`| `links:write` | Update original destination, tags, or status |
| `DELETE`| `/api/public/v1/links/:code`| `links:delete`| Permanently purge a shortened link |
| `GET` | `/api/public/v1/links/:code/analytics` | `analytics:read` | Fetch pre-aggregated telemetry metrics |
| `POST` | `/api/public/v1/links/bulk` | `links:write` | Atomic bulk link provisioning (up to 1,000 links) |

### In-Browser Developer CLI (`linkora-cli`)

Linkora features an interactive Unix terminal emulator directly embedded in the dashboard:
- Full command tokenization supporting single quotes, double quotes, and flag parameters (`--limit`, `--custom`, `-t`).
- Live command history navigation (Up / Down arrows).
- Tab auto-completion across available subcommands and short slugs.
- Formatted ASCII data tables and direct execution against the Public API.

---

## 6. Deployment Topologies & Operational Runbooks

### Microservices vs. Embedded Execution Topologies

Linkora can be deployed across two production runtime models:

```
[ TOPOLOGY A: ENTERPRISE CLUSTER ]
  +------------------+       +------------------+
  |  API Node 01     |  ...  |  API Node N      |  (Stateless HTTP Redirections)
  +------------------+       +------------------+
            \                         /
             v                       v
      +-------------------------------------+
      |   Redis 7 Cluster (Stream Queue)    |
      +-------------------------------------+
            /                         \
           v                           v
  +------------------+       +------------------+
  | Ingestion Worker |  ...  | Ingestion Worker |  (Consumer Fleet: XREADGROUP)
  +------------------+       +------------------+
```

```
[ TOPOLOGY B: EMBEDDED SINGLE CONTAINER (Render / Railway / Koyeb) ]
  +---------------------------------------------+
  | Docker Container (Node 22 LTS)              |
  |  - Express HTTP Server (Port 5001)          |
  |  - In-Process Stream Consumer (Event Loop)  |
  |  - Scheduled Rollup Flush Engine            |
  +---------------------------------------------+
                         |
           +-------------+-------------+
           v                           v
    [ MongoDB Atlas ]           [ Upstash Redis ]
```

### Environment Configuration Reference

```env
# Runtime
NODE_ENV=production
PORT=5001
WORKER_MODE=embedded              # 'embedded' for single process, 'separate' for microservices

# Network & Ingress
FRONTEND_URL=https://linkora.domain.com
RATE_LIMIT_MAX_REQUESTS=1500      # 1500 requests per 15 minutes per genuine client IP
RATE_LIMIT_WINDOW=15

# Persistence Stores
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/linkora?retryWrites=true&w=majority
REDIS_URL=rediss://default:<password>@cluster-node.redis.io:6379

# Cryptography & Security
JWT_SECRET=super_secret_cryptographically_secure_key_32_characters_minimum
JWT_ACCESS_TOKEN_TTL=15m
JWT_REFRESH_TOKEN_TTL_SECONDS=2592000
COOKIE_SAMESITE=none              # 'none' for decoupled cross-origin (CHIPS), 'strict' for same-origin
COOKIE_SECURE=true

# Telemetry & Retention
CLICK_EVENT_RETENTION_DAYS=90     # Retention window for raw time-series collections
```

### Zero-Downtime Liveness & Readiness Probes

Linkora implements distinct HTTP probe routes to satisfy Kubernetes and cloud orchestrator requirements:
- `GET /health/liveness`: Returns `200 OK` instantly with zero database/Redis overhead. Probes basic process health without creating command amplification.
- `GET /health/readiness`: Executes active `PING` commands against Redis and MongoDB connections. Used to gate traffic routing during pod boot sequences.

---

## 7. Automated Testing & Verification Pipeline

Linkora enforces automated testing standards via GitHub Actions:

```
[ Push / PR Event to main ]
             |
             +---------------------------------------+
             |                                       |
             v                                       v
+-------------------------+             +-------------------------+
| Backend Job (Node 22)   |             | Frontend Job (Node 22)  |
| - Mongo 7.0 Container   |             | - ESLint Static Check   |
| - Redis 7.0 Container   |             | - Vitest Unit Suite     |
| - Vitest 23 Suites      |             | - Vite Production Build |
| - 86 Integration Tests  |             +-------------------------+
+-------------------------+                          |
             |                                       |
             +-------------------+-------------------+
                                 |
                                 v
                     +-----------------------+
                     | CI Status Check Gate  |
                     | Required Branch Merge |
                     +-----------------------+
```

### Running the Test Suites Locally

#### Backend Test Suite (23 Suites / 86 Tests)
Executes end-to-end integration runs covering token rotation, stream deduplication, rollups, and SSRF validations:
```bash
cd backend
npm test
```

#### Frontend Test Suite & Linting
Executes parser validations, QR engine tests, and static linting:
```bash
cd frontend
npm run lint      # ESLint static code verification
npm test -- --run # Vitest unit test suite (26 tests)
npm run build     # Production Vite bundle compilation
```

---

## License

This project is licensed under the **MIT License**. Permitted for both commercial and personal use.
