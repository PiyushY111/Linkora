# Known bugs and limitations

Behaviour that is known to be wrong, risky, or weaker than it looks, and is
not fixed yet. Each entry says where it lives and how it was found. When
one is fixed, delete it here in the same commit.

Severity: **High** loses or exposes data in normal use; **Medium** is wrong
under specific conditions or weakens a security property; **Low** is minor
or cosmetic.

## Analytics pipeline

### 1. Clicks are silently lost when the consumer falls behind (High)

`XADD MAXLEN ~ CLICK_STREAM_MAXLEN` (10,000) trims the oldest stream entries
whether or not a consumer has read them. When clicks arrive faster than the
consumer stores them, the backlog passes 10,000 and unread clicks are
deleted. The consumer only logs entries trimmed while *pending*
(`claimStalePending`); entries trimmed before any consumer read them leave
no log line or metric.

- Where: `backend/src/services/eventStreamService.js` (`emitClickEvent`),
  `backend/src/consumers/clickConsumer.js`
- Evidence: [benchmarks/README.md](../benchmarks/README.md). With every
  click on one link, the embedded consumer kept up at about 460 clicks/s,
  lost 0.8% at about 900/s, and about 80% at full redirect speed
  (~3,000 req/s).
- Options: detect and report the gap (compare the group's last-delivered
  ID with the stream's first entry); raise the cap; batch the per-document
  rollup and `Link.clicks` updates (every click currently rewrites the same
  documents' 1,000-entry dedup arrays); run the consumer separately.

### 2. The click stream holds raw visitor data until it is trimmed (Medium)

Stream entries carry the raw IP, full user agent and **full referer URL**,
whose query string can contain tokens. `XACK` does not delete entries, so
they stay in Redis until `MAXLEN` trims them, even for owners who turned on
IP anonymization. The consumer stores only what it should, but Redis holds
the raw values in the meantime.

- Where: `backend/src/controllers/analyticsController.js` (`emitClickEvent`
  calls)
- Fix: reduce the referer to its host before `XADD`; hash or drop the IP
  there too (GeoIP would then have to move to the redirect path, or keep a
  truncated IP).

### 3. A/B variant click counts are written on the redirect path (Low)

`variants.$.clicks` is incremented with a non-awaited `updateOne` on every
A/B redirect. It is not idempotent, includes bot traffic, and can disagree
with the rollups' `variant` dimension, which the dashboard also shows.
The link API also lets clients set `variants[].clicks` directly (see 9).

- Where: `backend/src/controllers/analyticsController.js` (`redirectLink`)

### 4. Legacy `Analytics` documents are created but never updated (Low)

`createLinkRecord` creates an `Analytics` document per link, and link reads
populate it, but nothing updates its counters. `Link.analytics` is never
set to the new document's ID, so deleting a link calls
`findByIdAndDelete(undefined)` and orphans it. Account deletion doesn't
delete them either.

- Where: `backend/src/models/Analytics.js`, `backend/src/controllers/linkController.js`
- Fix: stop creating them and drop the collection, after checking nothing
  in the frontend reads `link.analytics`.

## Webhooks

### 5. Webhook retries are neither durable nor idempotent for receivers (Medium)

Retries are `setTimeout` timers in the process that made the first attempt,
so a restart loses every pending retry. Each attempt also generates a new
event `id` (`evt_...`), so a receiver cannot recognise a retry of an event
it already processed. The 2-hour delay in `RETRY_DELAYS_MS` is never used
(five attempts use the first four delays).

- Where: `backend/src/services/webhookService.js` (`executeDelivery`)

### 6. Scheduled jobs run in every API instance (Medium with more than one instance)

`server.js` starts the expiry check and abuse rescan in every API process,
with no lock or leader election. With several instances, `link.expired` can
be sent more than once for the same link: the check reads expired links,
dispatches, and only then sets `expiryNotified`.

- Where: `backend/src/server.js`, `webhookService.js` (`checkExpiredLinks`)

## Security and privacy

### 7. The access token is stored in `localStorage` (Medium)

The frontend persists the 15-minute access token in `localStorage`, where
any script running on the page can read it. The refresh token is an httpOnly
cookie and is not exposed.

- Where: `frontend/src/context/authStore.js`
- Fix: keep the access token in memory only and rely on the refresh cookie
  (`bootstrapSession` already does a silent refresh on load).

### 8. Dashboard sessions get full scope on the public API (Low)

A request to `/api/public/v1` with a dashboard JWT and no API key (the
in-browser playground and CLI) takes the scopes of the user's newest active
key, or `*` if they have none. It never exceeds what the same user can do in
the dashboard, but it ignores the scope restrictions of their keys.

- Where: `backend/src/middleware/apiKeyAuth.js`

### 9. Link create/update payloads are not schema-validated (Low)

`createLinkRecord` calls string methods on fields without checking their
type (`ogTitle: 123` fails with a 500), and lets the client set
`variants[].clicks`, `qrCode`, and an arbitrary `utm` object.

- Where: `backend/src/controllers/linkController.js`
- Fix: validate the payload with `zod` (already a dependency) before use.

## Operations

### 10. The global in-memory rate limiter also applies to redirects (Medium)

`app.js` limits every route, redirects included, to
`RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW` minutes per IP (code
default 1,500 per 15 minutes; `.env.example` sets 100). Visitors behind a
shared IP (an office, carrier NAT) get 429s on a popular link. The limiter
is also per process, so the effective limit grows with the number of
instances.

- Where: `backend/src/app.js`

### 11. Readiness fails when MongoDB is more than 50 ms away (Low)

`/health/readiness` returns 503 if a MongoDB ping takes 50 ms or more. A
managed cluster in another region routinely exceeds that, so a platform
that gates traffic on readiness can mark a healthy instance unready.

- Where: `backend/src/app.js`

### 12. QR logos are stored inline in the link document (Low)

An uploaded QR logo (up to 2 MB, about 2.7 MB as base64) is stored in
`Link.qrConfig`. This is why link create/update accepts 3 MB bodies. The
redirect path reads the whole link document on a cache miss, so a link with
a logo makes each cache miss read megabytes.

- Where: `frontend/src/components/qr/QRCodeCustomizer.jsx`,
  `backend/src/controllers/linkController.js`,
  `backend/src/controllers/analyticsController.js` (cache-miss `findOne`
  without a projection)

## Tests

### 13. Intermittent failures in the backend suite

About 1 run in 10 on a development laptop, one test fails, a different one
each time, and never when the same file is run alone. Signatures seen:
`Error: socket hang up` from supertest; the unlock rate-limit test getting
401 where it expects 429 on the sixth attempt; the analytics summary test
reporting fewer clicks than it recorded. Not reproduced with logging
enabled (0 of 10 runs). Not seen on the pre-hardening `main` branch in 10
runs, but that branch had fewer test files running in parallel.
