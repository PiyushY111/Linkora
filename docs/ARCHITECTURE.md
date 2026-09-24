# Linkora — Deep Distributed Systems Architecture & Engineering Reference

This document provides a comprehensive, exhaustive breakdown of Linkora's internal distributed systems design, data persistence topologies, cryptographic security invariants, and algorithmic implementations.

---

## Table of Contents

- [1. End-to-End System Architecture](#1-end-to-end-system-architecture)
- [2. Write Amplification Mitigation & Dual-Path Ingestion](#2-write-amplification-mitigation--dual-path-ingestion)
- [3. Redis Stream Processing & Exactly-Once Idempotency Ledger](#3-redis-stream-processing--exactly-once-idempotency-ledger)
- [4. Pre-Aggregated Rollups & Cardinality Bounding](#4-pre-aggregated-rollups--cardinality-bounding)
- [5. Probabilistic Early Expiration (XFetch) Cache Defense](#5-probabilistic-early-expiration-xfetch-cache-defense)
- [6. Collision-Resilient Monotonic Sequence Permutation](#6-collision-resilient-monotonic-sequence-permutation)
- [7. Complete Database & Persistence Schema](#7-complete-database--persistence-schema)
  - [7.1 MongoDB Collections](#71-mongodb-collections)
  - [7.2 Redis In-Memory Key Space Architecture](#72-redis-in-memory-key-space-architecture)
- [8. Zero-Trust Security, Token Rotation & Threat Modeling](#8-zero-trust-security-token-rotation--threat-modeling)
  - [8.1 Refresh Token Rotation & Token Family Revocation](#81-refresh-token-rotation--token-family-revocation)
  - [8.2 Partitioned Cross-Origin Cookies (CHIPS)](#82-partitioned-cross-origin-cookies-chips)
  - [8.3 Multi-Layer SSRF Defense & DNS Pinning](#83-multi-layer-ssrf-defense--dns-pinning)
  - [8.4 Cryptographic Webhook Signing & Circuit Breakers](#84-cryptographic-webhook-signing--circuit-breakers)
  - [8.5 Reverse-Proxy Keyed Token-Bucket Rate Limiter](#85-reverse-proxy-keyed-token-bucket-rate-limiter)
- [9. Production Topologies & Microservices Orchestration](#9-production-topologies--microservices-orchestration)

---

## 1. End-to-End System Architecture

```
[ Inbound HTTP Traffic ]
           |
           v
+------------------------------------------------------------------------+
| 1. EDGE & REVERSE PROXY LAYER (Cloudflare / Nginx / ALB)              |
|    - SSL/TLS Termination                                               |
|    - Client IP Normalization (CF-Connecting-IP, X-Real-IP)             |
|    - Edge Caching of Static Assets & CORS Preflight Handling           |
+------------------------------------------------------------------------+
                                   |
                                   v
+------------------------------------------------------------------------+
| 2. API GATEWAY & SECURITY INGRESS (Express ESM / Node 22 LTS)          |
|    - Helmet HTTP Security Headers (Strict CSP, HSTS, Sniff Prevention) |
|    - IP-Keyed Token-Bucket Rate Limiter (Sliding Window in Redis)      |
|    - CSRF Protection & Explicit Origin Validation                      |
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

## 2. Write Amplification Mitigation & Dual-Path Ingestion

Standard URL shorteners commit a relational or document write on every inbound redirect to update click counts and log visitor telemetry. Under flash crowds (e.g. 50,000 requests per second), this architecture rapidly collapses due to disk IOPS saturation, connection pool exhaustion, and lock contention on the hot link record.

Linkora decouples redirection latency from analytical telemetry via a **Dual-Path Ingestion Architecture**:

1. **Synchronous Fast Path (Redirection Path)**:
   - Request enters `GET /api/r/:shortCode`.
   - Redis L1 cache is probed via `GET cache:link:{shortCode}`.
   - If hit, password requirements, usage caps, and expiration timestamps are validated entirely in memory.
   - Active device targeting (iOS deep links vs Android intents) or weighted A/B variant selections are evaluated in sub-millisecond compute.
   - An event payload containing raw metadata (timestamp, IP, user-agent, referer, link ID) is dispatched asynchronously to the Redis stream via `XADD stream:clicks MAXLEN ~ 100000 * ...`.
   - HTTP `307 Temporary Redirect` is immediately returned to the client. The client connection terminates with zero database disk I/O.

2. **Asynchronous Ingestion Path (Worker Fleet)**:
   - Dedicated worker processes (or in-process embedded consumers) poll `stream:clicks` using Redis consumer groups (`XREADGROUP GROUP click-consumers ...`).
   - Batches of up to 500 click events are processed in micro-batches, enriching the raw events with GeoIP lookups, device signatures, and bot classification heuristics.
   - Batches are written to MongoDB using atomic bulk operations (`bulkWrite`), consolidating hundreds of distinct write operations into a single network round-trip.

---

## 3. Redis Stream Processing & Exactly-Once Idempotency Ledger

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

---

## 4. Pre-Aggregated Rollups & Cardinality Bounding

Querying millions of raw time-series documents using runtime aggregation pipelines (`$group`, `$match`, `$unwind`) causes unacceptable latency spikes and memory consumption on production analytical dashboards.

Linkora eliminates runtime aggregation latency by pre-computing rollups during stream consumption into two bounded collections:
- `link_stats_hourly`: Hourly rollup buckets for high-resolution short-term telemetry (7-day retention).
- `link_stats_daily`: Daily rollup buckets for long-term historical reporting (unbounded retention).

### Dimensionality Capping (Protection against Unbounded Document Growth)
To prevent BSON document size overflow (16MB MongoDB limit) caused by high-cardinality referrers or user agents, Linkora enforces **Dimension Capping**:
- Each dimensional category (browsers, devices, operating systems, countries, referrers) maintains a maximum of 20 unique keys per bucket document.
- When inbound events exceed the 20-key threshold, the consumer automatically routes overflow metrics into a designated `other` key.
- Each dimension tracks both total interactions (`a`) and human-verified traffic (`h`), allowing instant bot-filtering without separate collection scans.

---

## 5. Probabilistic Early Expiration (XFetch) Cache Defense

In high-concurrency systems, standard TTL-based cache expiration triggers the **Cache Stampede (Thundering Herd)** problem: the exact second a hot cache key expires, thousands of concurrent requests miss cache simultaneously and execute redundant database reads, saturating the database.

Linkora implements the **XFetch Probabilistic Early Recomputation Algorithm**:

$$\Delta t - \beta \cdot \ln(rand()) > \text{TTL}$$

Where:
- $\Delta t$: Computation time required to build the cache entry.
- $\beta$: Eagerness parameter ($\beta > 0$, default `1.0`).
- $rand()$: Uniformly distributed pseudo-random float $\in (0, 1]$.
- $\text{TTL}$: Remaining time-to-live of the cached key.

As the remaining TTL decreases, the probability of background cache recomputation increases. A single worker thread transparently refreshes the cache asynchronously before expiration occurs, ensuring that incoming reader requests experience a 100% cache hit rate with zero database thundering herds.

---

## 6. Collision-Resilient Monotonic Sequence Permutation

Many URL shorteners rely on random string generation (e.g. `crypto.randomBytes(4)`), which suffers from the **Birthday Paradox**: collision probabilities escalate rapidly as dataset sizes scale past several million records, requiring expensive retry loops and unique index checks.

Linkora guarantees collision-free short codes using a **Monotonic Distributed Sequence Generator** combined with a **Feistel pseudo-random permutation cipher**:
- Sequences are driven by an atomic MongoDB counter (`Counter` collection) utilizing `findOneAndUpdate` with `$inc`.
- Numeric counter values are mapped bijectively using a Feistel block cipher into an unpredictably distributed 32-bit integer space. This prevents competitors or scrapers from guessing adjacent URLs.
- Permuted integers are encoded into **Base62 strings** using the alphabet `[0-9a-zA-Z]`.
- A 7-character Base62 string provides $62^7 \approx 3.52 \times 10^{12}$ (3.52 trillion) unique addressable URLs.

---

## 7. Complete Database & Persistence Schema

### 7.1 MongoDB Collections

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

---

### 7.2 Redis In-Memory Key Space Architecture

| Key Pattern | Data Structure | TTL Policy | Memory Policy | Purpose |
|---|---|---|---|---|
| `cache:link:{shortCode}` | `String` (JSON) | 3600s + Jitter | Ephemeral Cache | Hot-path cached link redirect metadata |
| `link:usage:{linkId}` | `Integer` | None / Managed | Evictable Counter | Atomic in-memory hit tracking for fast cap checks |
| `stream:clicks` | `Stream` | Capped via `MAXLEN` | Ring-buffer buffer | High-throughput async ingestion queue |
| `ratelimit:{prefix}:{ip}`| `Sorted Set` | Sliding Window | Auto-expiring | Sliding-window atomic Lua rate limiter |
| `ratelimit:public-api:{key}`| `Hash` | Token Bucket | Auto-expiring | Scoped API Key token-bucket limiter |
| `refresh:family:{id}:curr` | `String` | 30 Days | Volatile TTL | Active refresh token in cryptographic rotation chain |
| `refresh:family:{id}:user` | `String` | 30 Days | Volatile TTL | User ownership verification for token family |
| `worker:lock:{name}` | `String` | 30s Heartbeat | Distributed Lock | Leader election for cron jobs & rollup flushes |

---

## 8. Zero-Trust Security, Token Rotation & Threat Modeling

### 8.1 Refresh Token Rotation & Token Family Revocation

Linkora strictly adheres to RFC 6749 OAuth 2.0 security specifications to guard against token theft and session hijacking:

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

- **In-Memory JWT Access Token**: The React client stores the JWT access token purely in memory (Zustand store), preventing any XSS script from reading credentials out of `localStorage`.
- **Reuse Detection**: If a compromised refresh token is presented after having already been rotated, Linkora flags a replay attack, instantly destroys the entire token family, and forces all active sessions for that family to re-authenticate.

### 8.2 Partitioned Cross-Origin Cookies (CHIPS)

To support decoupled architectures (e.g. Next.js/Vite frontend hosted on Vercel communicating with an API cluster on Render/Railway), Linkora implements **Cookies Having Independent Partitioned State (CHIPS)**:

```javascript
res.cookie('refreshToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  partitioned: true,
  maxAge: 30 * 24 * 60 * 60 * 1000,
});
```

### 8.3 Multi-Layer SSRF Defense & DNS Pinning

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

- **DNS Pinning**: The outbound dispatcher (via `undici.Agent`) binds the connection socket directly to the IP address verified during the pre-flight check, eliminating DNS rebinding (TOCTOU) attacks.
- **Non-Redirect Guarantee**: Outbound HTTP dispatchers configure `redirect: 'manual'`. Webhook targets cannot return a 302 redirecting to an internal loopback address to bypass initial checks.

### 8.4 Cryptographic Webhook Signing & Circuit Breakers

Every outbound webhook delivery is verified through a cryptographically secure signature sent via the `x-linkora-signature` header:

$$\text{Signature} = \text{HMAC-SHA256}(\text{secret}, \text{timestamp} \cdot \text{payload})$$

```http
x-linkora-signature: t=1727161200,v1=5d41402abc4b2a76b9719d911017c592
```

- **Replay Protection**: Receivers verify that $|t_{\text{current}} - t_{\text{header}}| \le 300\text{ seconds}$.
- **Circuit Breaker Integration**: Outbound dispatches are wrapped in an **Opossum Circuit Breaker**. If an external webhook receiver fails 5 consecutive times (timeouts or 5xx status), the breaker opens, halting further dispatches to protect backend connection sockets.
- **Dead Letter Queue (DLQ)**: Failed dispatches retry across exponential intervals (`10s`, `1m`, `5m`, `30m`, `2h`). If all retries are exhausted, the delivery record transitions to `failed` and logs to `stream:webhooks:dlq`.

---

## 9. Production Topologies & Microservices Orchestration

Linkora supports two distinct production runtime models:

```
[ TOPOLOGY A: DECOUPLED NODE SERVICES (Render / Railway / VM) ]
  - React SPA (Port 3000) -> Communicates with API Gateway
  - Linkora API Gateway (Port 5000)
  - Linkora Click Consumer Worker (Node CLI Worker)
  - Managed MongoDB 7.0 (Atlas / Self-hosted)
  - Managed Redis 7.0 (Upstash / Redis Cloud / Self-hosted)
```

```
[ TOPOLOGY B: HIGH-AVAILABILITY CLUSTER (Kubernetes / ECS) ]
  - Cloudflare Edge (SSL, WAF, Static Caching)
  - Ingress Controller -> API Pod Fleet (Horizontal Pod Autoscaler)
  - Redis 7 Sentinel / Cluster (Stream Queue & Shared Caching)
  - Consumer Fleet Pods (Scaled on XPENDING stream depth)
  - MongoDB Atlas Replica Set (Primary + Secondaries)
```
