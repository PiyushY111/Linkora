# Architecture

Linkora is an Express API (`backend/src`), a click-consumer worker that can
run in the API process or on its own, MongoDB, Redis, and a React/Vite SPA
(`frontend/src`).

```
 browser / API client
        |
        v
 +-------------------+   HGETALL link:meta:*   +-------------------+
 |  Express API      | ----------------------> |  Redis            |
 |  (backend/src)    |   XADD stream:clicks    |  cache, stream,   |
 |                   | ----------------------> |  rate limits,     |
 +-------------------+                         |  refresh tokens   |
        |  links, users, keys,                 +-------------------+
        |  webhooks, analytics reads                  |
        v                                             | XREADGROUP
 +-------------------+   bulk writes, rollups  +-------------------+
 |  MongoDB          | <---------------------- |  Click consumer   |
 |                   |                         |  (embedded or     |
 +-------------------+                         |  separate process)|
                                               +-------------------+
                                                      | click webhooks
                                                      v
                                               subscriber endpoints
```

## Components

| Component | Code | Notes |
|---|---|---|
| API | `backend/src/app.js`, `server.js` | Stateless apart from the in-memory global rate limiter. `app.js` builds the app with no side effects; `server.js` connects, schedules cron jobs, and listens. |
| Click consumer | `backend/src/consumers/clickConsumer.js` | `WORKER_MODE=embedded` runs it inside the API process (one free-tier instance can host everything); `separate` runs it with `npm run consumer`. Several consumers share work through one Redis consumer group. |
| MongoDB | `backend/src/models`, `repositories/analytics` | System of record: users, links, API keys, webhooks, raw click events, rollups. |
| Redis | `backend/src/services/cacheService.js` | Link cache, click stream, rate limits, refresh-token families, short-lived tokens. See [redis-keys.md](redis-keys.md). |
| Frontend | `frontend/src` | SPA. The 15-minute access token is kept in `localStorage` (readable by any script on the page, see [KNOWN_BUGS](KNOWN_BUGS.md)); the refresh token is an httpOnly cookie scoped to `/api/auth`. |

## Redirect path

`GET /api/r/:shortCode` (`controllers/analyticsController.js`,
`redirectLink`):

1. `HGETALL link:meta:{shortCode}`. On a miss, read the link from MongoDB
   (read preference `nearest`) and cache it; on an unknown code, cache a
   negative entry for 2 minutes.
2. Check, in memory: active, expiry, password (a single-use unlock token
   from `POST /api/r/:shortCode/unlock`), click cap (an atomic Lua counter in
   Redis, only when `maxClicks` is set).
3. Choose the destination: an A/B variant by a stable hash of IP and user
   agent, or an iOS/Android override.
4. Respond `307` with `Cache-Control: no-store`. Social-media crawlers get an
   HTML page with OpenGraph tags instead.
5. After responding, `XADD` the click to `stream:clicks`, without awaiting
   it. An A/B redirect also fires a non-awaited MongoDB update of the
   variant's click count.

A cached redirect costs two Redis commands and no MongoDB round trip. The
cache uses XFetch probabilistic early refresh: as an entry nears expiry, one
request (guarded by a 5-second lock) re-reads MongoDB in the background, so
a popular link doesn't make every request miss at once when its entry
expires.

Measured throughput and latency: [benchmarks/README.md](../benchmarks/README.md).

## Click-event flow

```
redirect ── XADD MAXLEN ~ 10000 ──> stream:clicks
                                        │ XREADGROUP (batches of up to 500)
                                        v
                              click consumer
      enrich: GeoIP (MaxMind, local .mmdb), user agent, bot flag,
              IP masking if the owner enabled it, HMAC visitor hash
                                        │
                                        v
      recordClicks (repositories/analytics/mongoAnalyticsWriter.js)
        1. claim event IDs in processed_events (unique _id = stream ID)
        2. insert raw rows into click_events (time-series collection)
        3. $inc hourly and daily rollups (link_stats_hourly / _daily)
        4. $inc Link.clicks
        5. PFADD visitor hash into hll:visitors:{link}:{day};
           write the estimate into the daily rollup with $max
        6. mark events done in processed_events
                                        │
                                        v
                         XACK, then click webhooks (not awaited)
```

### Delivery guarantee: at least once, applied once

The stream gives at-least-once delivery: a consumer that crashes before
`XACK` leaves its batch pending, and a consumer reclaims entries that have
been pending for 30 seconds or more with `XAUTOCLAIM`, which runs every
`CLICK_CONSUMER_CLAIM_INTERVAL_MS` (5 minutes). Every write in `recordClicks` is idempotent
on the stream entry ID, so a redelivered event is not counted twice:

- `processed_events` records each event as `pending` then `done`; `done`
  events are skipped. It expires after 3 days, far longer than any
  redelivery window.
- Rollup and `Link.clicks` updates only match a document whose
  `appliedIds` / `appliedClickIds` window (the last 1,000 event IDs) does not
  already contain the event, and push the ID in the same update.
- `PFADD` is a set operation and the daily count is written with `$max`.

This is not exactly-once end to end:

- **Clicks can be lost before they reach the consumer.** `XADD` is not
  awaited and its failure is only logged. `XADD MAXLEN ~ 10000` drops the
  oldest entries once the backlog passes about 10,000, **including entries
  no consumer has read yet**. The benchmark shows this happens on one
  laptop above roughly 500 to 900 clicks per second on a single link. See
  [KNOWN_BUGS.md](KNOWN_BUGS.md).
- Click webhooks fire after `XACK` and are not retried across restarts.

## Analytics reads

Dashboards read rollups, never raw events, apart from the recent-clicks
feed and CSV export (`repositories/analytics/mongoAnalyticsReader.js`):

- Ranges of 48 hours or less inside the retention window use hourly
  rollups; everything else uses daily rollups.
- Each dimension map in a rollup document (country, city, device, browser,
  OS, referrer, UTM source/medium/campaign, A/B variant) keeps its first N
  distinct values per bucket (N is 10 to 60 depending on the dimension) and
  counts the rest under "Other". This bounds document size, but a long-tail
  value that first appears late in a busy hour or day is counted as
  "Other" (see `rollupDimensions.js`).
- Every rollup keeps all-clicks (`a`) and human-only (`h`) counts, so
  "exclude bots" needs no second query.

**Unique visitors are approximate.** Each day's count is a Redis
HyperLogLog estimate (about 0.8% standard error). A multi-day range reports
the *sum* of daily uniques, so someone who visits on three days counts three
times. An hourly range reports the uniques of the calendar days it touches.

### Retention

| Data | Kept for |
|---|---|
| `click_events` (raw rows, including IPs) | `CLICK_EVENT_RETENTION_DAYS` (90), time-series TTL |
| `link_stats_hourly` | `CLICK_EVENT_RETENTION_DAYS` (90), TTL index |
| `link_stats_daily` | Until the link or account is deleted |
| `processed_events` | 3 days |

## Webhooks

`services/webhookService.js`. Events: `link.clicked` (alias `click`),
`link.created`, `link.updated`, `link.deleted`, `link.expired`,
`link.limit_reached`, `security.abuse_flagged` (alias `abuse.flagged`), and
`endpoint.test` (sent by the dashboard's test button).

- **Signature.** `Linkora-Signature: t=<unix>,v1=<hex>`, where `v1` is
  HMAC-SHA256 with the webhook's secret over `"<t>.<raw body>"`. Receivers
  should recompute it, compare in constant time, and reject a `t` more than
  a few minutes old. `X-Linkora-Signature` carries an older HMAC of the body
  alone, with no timestamp and therefore no replay protection.
  Deprecated `Linkly-*` copies of these headers are still sent for
  receivers built before the rename; new integrations should ignore them.
- **SSRF.** A webhook URL is validated when registered, and again at connect
  time: the undici dispatcher resolves DNS itself and refuses to connect if
  any answer is a blocked address (`lib/ssrfSafeDispatcher.js`,
  `lib/ipBlocklist.js`). Redirects are not followed.
- **Retries.** Five attempts in total; the waits between them are 10 s,
  1 min, 5 min and 30 min, plus up to 2 s of jitter. Retries are in-process
  timers and are lost if the process restarts. After the last failure the delivery goes to the
  `stream:webhooks:dlq` Redis stream. Every attempt is logged in
  `webhook_deliveries` and can be replayed from the dashboard.
- **Auto-disable.** After 10 consecutive failures the webhook is turned off.

## Scheduled jobs

`node-cron`, started by `server.js` in every API process (there is no
leader election, so with several API instances each one runs them):

| Job | Schedule | What it does |
|---|---|---|
| Expiry check | every 15 min | Sends `link.expired` for newly expired links. With several API instances, a link can be announced more than once. |
| Abuse rescan | every 12 h, only when Safe Browsing or VirusTotal is enabled | Re-checks active links and disables flagged ones. |
| GeoIP update | Sundays 03:00, only when MaxMind credentials are set | Downloads a fresh GeoLite2 database. Runs where the consumer runs. |

## Security boundaries

| Concern | Where |
|---|---|
| Browser origins (CORS and CSRF) | `lib/originPolicy.js`: exact match on `FRONTEND_URL` + `ALLOWED_ORIGINS`; localhost only outside production |
| Access tokens | `utils/jwt.js`: HS256 pinned, 15-minute lifetime |
| Refresh tokens | `utils/jwt.js`: rotating, family-based reuse detection, stored in Redis, httpOnly cookie on `/api/auth` |
| API keys | `models/ApiKey.js`, `middleware/apiKeyAuth.js`: SHA-256 hash stored, scoped, revocable |
| Outbound requests to user URLs | `lib/ipBlocklist.js`, `lib/ssrfSafeDispatcher.js` |
| Client IP | `req.ip` with `TRUST_PROXY_HOPS` (`utils/helpers.js`) |
| Link passwords | bcrypt; exchanged for a 60-second single-use token so the password never appears in a URL |
| Request size | 100 KB default; 2 MB bulk create; 3 MB dashboard link create/update (QR logos) |
