# Linkora

[![CI](https://github.com/PiyushY111/Linkora/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/PiyushY111/Linkora/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A URL shortener with click analytics, QR codes, webhooks and a public API.
Express, MongoDB and Redis on the backend, React and Vite on the frontend.

<!-- Screenshot: add docs/images/dashboard.png and uncomment.
![Linkora dashboard](docs/images/dashboard.png)
-->

## What it does

- **Short links** with custom aliases, expiry dates, click caps, password
  protection, iOS/Android destination overrides, weighted A/B splits, and
  OpenGraph previews for social-media crawlers.
- **Click analytics**: totals, human vs bot, approximate unique visitors,
  and breakdowns by country, city, device, browser, OS, referrer, UTM and
  A/B variant, from pre-aggregated hourly and daily rollups. CSV export of
  raw clicks. Optional masking of visitor IPs before storage.
- **QR codes** with custom colours, shapes, frames and logos.
- **Webhooks**, signed with HMAC-SHA256, with retries and a delivery log.
- **Public REST API** (`/api/public/v1`) with hashed, scoped, revocable API
  keys, and an in-browser playground and CLI.
- **Workspaces** with owner/admin/creator/viewer roles (membership
  management only; links belong to a user, not a workspace).
- **Optional integrations**: Google Safe Browsing and VirusTotal URL checks,
  WorkOS SSO (never tested against a live WorkOS account), MaxMind GeoIP.

Not implemented: custom domains, email notifications (the setting is shown
as "coming soon").

## Quick start

With Docker:

```bash
git clone https://github.com/PiyushY111/Linkora.git && cd Linkora
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
docker compose up --build
```

Open http://localhost:8080. This starts MongoDB, Redis, the API, a separate
click consumer, and nginx serving the frontend and proxying `/api`.
`scripts/smoke-test.sh` runs register → create link → redirect → check the
click shows up in analytics against it.

Without Docker (Node.js 22+, MongoDB 7+ and Redis 7+ running locally):

```bash
cd backend
cp .env.example .env
#   set MONGODB_URI=mongodb://127.0.0.1:27017/linkora, a JWT_SECRET of 32+
#   characters, and PORT=5001 (the frontend dev proxy targets 5001)
npm ci
WORKER_MODE=embedded npm run dev

cd ../frontend            # in a second terminal
cp .env.example .env
npm ci
npm run dev               # http://localhost:3000, proxies /api to :5001
```

Run Redis with `maxmemory-policy noeviction`: some keys (refresh tokens,
the click stream) are not a cache. See [docs/redis-keys.md](docs/redis-keys.md).

## Architecture

```
browser ──> Express API ──HGETALL / XADD──> Redis ──XREADGROUP──> click consumer
                 │                                                     │
                 └──────────── MongoDB (links, users, analytics) <─────┘
```

- **Redirects** (`GET /api/r/:shortCode`) are served from a Redis cache,
  two Redis commands and no MongoDB round trip on a hit, and answer `307`.
  The click is appended to a Redis stream after the response is sent.
- **The click consumer** reads the stream in batches, enriches each click
  (GeoIP, user agent, bot detection), and writes raw events to a MongoDB
  time-series collection plus hourly and daily rollups. It runs inside the
  API process (`WORKER_MODE=embedded`) or on its own (`npm run consumer`).
- **Delivery is at least once, applied once**: every write is idempotent on
  the stream entry ID, so a crashed batch can be retried without double
  counting. It is not exactly once end to end, because clicks can be lost
  before the consumer reads them (see below).

Details: [docs/architecture.md](docs/architecture.md). Why analytics live
in MongoDB: [ADR 0005](docs/adr/0005-analytics-on-mongodb.md). Why there is
one Redis database: [ADR 0006](docs/adr/0006-single-redis-database.md).

## Performance

Measured on one laptop (Apple M3, API, databases and load generator all on
the same machine), with every request hitting one cached link. Method, raw
results and caveats: [benchmarks/README.md](benchmarks/README.md).

| | Result |
|---|---|
| Cached redirects, 10 concurrent clients | about 3,000 req/s; p50 2.2 ms, p95 6.6 ms, p99 16 ms |
| Click pipeline, one hot link | keeps up at about 460 clicks/s; loses 0.8% at about 900/s |

## Trade-offs and limitations

- **Clicks are lost silently if the consumer falls behind.** The stream is
  capped at 10,000 entries and trimming discards unread clicks. In the
  benchmark this starts somewhere between 460 and 900 clicks/s on a single
  link.
- **Unique visitors are approximate**: a daily HyperLogLog estimate
  (about 0.8% error), summed across days, so a returning visitor counts
  once per day.
- **Breakdowns are bounded**: each rollup keeps the first 10 to 60 distinct
  values per dimension per bucket and counts the rest as "Other".
- **Refresh tokens live only in Redis**: losing Redis data logs everyone
  out.
- **Webhook retries are in-process timers**, lost on restart.
- **Scheduled jobs run in every API instance**; with several instances,
  some webhooks (`link.expired`) can be sent twice.
- **The access token is kept in `localStorage`.**

The full list, with locations and severity: [docs/KNOWN_BUGS.md](docs/KNOWN_BUGS.md).

## Security

- Exact-match origin allowlist for CORS and the CSRF check
  (`FRONTEND_URL` + `ALLOWED_ORIGINS`).
- HS256-pinned 15-minute access tokens; rotating refresh tokens with reuse
  detection in an httpOnly cookie.
- API keys stored as SHA-256 hashes, with scopes and revocation.
- SSRF protection for link destinations and webhooks: every resolved
  address is checked against loopback, private and reserved ranges, and
  webhook delivery re-checks at connect time so DNS rebinding can't bypass
  it.
- bcrypt link passwords, exchanged for a single-use token so they never
  appear in a URL.
- Rate limits on login, registration, refresh, link creation, link unlock
  and the public API, keyed by the client IP from `req.ip` and
  `TRUST_PROXY_HOPS`. They fail open if Redis is unavailable.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## API

The public API is under `/api/public/v1` and takes an `x-api-key` header.
Keys are created in the dashboard's Developer page.

| Method | Path | Scope |
|---|---|---|
| `GET` | `/links` | `links:read` |
| `POST` | `/links` | `links:write` |
| `POST` | `/links/bulk` (up to 1,000) | `links:write` |
| `GET` | `/links/:code` | `links:read` |
| `PATCH` | `/links/:code` | `links:write` |
| `DELETE` | `/links/:code` | `links:delete` |
| `GET` | `/links/:code/analytics` | `analytics:read` |
| `GET` | `/usage` | any valid key |

The full contract, with request and response schemas, is
[docs/openapi.json](docs/openapi.json) (OpenAPI 3.1), also served without a
key at `GET /api/public/v1/openapi.json`. Tests check that it is valid, that
it lists exactly the routes the API serves, and that real responses match
its schemas. Requests are limited to bursts of 30 and 10 per second
sustained, per key.

Health checks: `GET /health/liveness` (no dependencies; use this for
platform health checks) and `GET /health/readiness` (pings Redis and
MongoDB). Prometheus metrics: `GET /metrics`, protected by `METRICS_TOKEN`.

## Configuration

Every variable, with defaults and comments, is in
[`backend/.env.example`](backend/.env.example); `backend/src/config/env.js`
validates them at startup and refuses to boot on an invalid value. The ones
that matter most in production:

| Variable | Why |
|---|---|
| `JWT_SECRET` | Signs access and unlock tokens. 16+ characters, required. |
| `FRONTEND_URL`, `ALLOWED_ORIGINS` | The only browser origins allowed to call the API with credentials. |
| `TRUST_PROXY_HOPS` | Number of proxies in front of the API. Wrong values make client IPs, and so rate limits, wrong or spoofable. |
| `WORKER_MODE` | `embedded` (consumer in the API process) or `separate`. |
| `METRICS_TOKEN` | Without it, `/metrics` is refused in production. |

## Testing

```bash
cd backend && npm test      # needs MongoDB and Redis; see below
cd frontend && npm test && npm run lint && npm run build
```

The backend suite runs against real MongoDB and Redis: it derives its
database name from `MONGODB_URI` (appending `_test`) and uses Redis database
15 (`TEST_REDIS_URL`). **Point `MONGODB_URI` at a local instance when
running tests**, not a shared or production cluster. It covers the auth and
refresh-token flows, CSRF and CORS origins, SSRF (including DNS rebinding),
the click pipeline's idempotency, rollups, the Redis command budget, and a
check that every Redis key the run creates has a TTL.

The frontend suite currently covers utility modules only.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
