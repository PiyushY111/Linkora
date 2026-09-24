# ADR 0005: Analytics on MongoDB

- **Status:** Accepted (2026-09-23)

## Context

Linkora has to run entirely on free tiers: MongoDB Atlas M0, one small Redis database, and one small app host. A dedicated analytics database would be one more service, one more set of credentials and, for columnar stores, one without a permanent free tier. It would also mean a second write path for every click.

What the product actually needs from analytics:

- per-link and per-user totals, unique visitors, bot and human split, and breakdowns by country, city, device, browser, OS, referrer, UTM and A/B variant, over ranges from 24 hours to "all time"
- the most recent clicks (the realtime stream)
- a raw CSV export

## Decision

MongoDB is the only analytics store. Access goes through one interface, `AnalyticsRepository` (`backend/src/repositories/analytics/analyticsRepository.js`), with one implementation, `MongoAnalyticsRepository`.

- **Raw clicks** go in a MongoDB **time-series collection**, with a retention TTL set by `CLICK_EVENT_RETENTION_DAYS` (default 90).
- **Dashboards read pre-aggregated rollups** (`link_stats_hourly`, `link_stats_daily`), which the click consumer maintains in the same batch as the raw write. So dashboard queries read at most a few hundred small documents, however many clicks there were.
- **Unique visitors** come from a Redis HyperLogLog per link per day. The count is written into the daily rollup, and the HLL key expires after 2 days.
- Raw events are read only for the CSV export and the recent-clicks stream.

The click-event flow, idempotency and rollup reads are described in [docs/architecture.md](../architecture.md#click-event-flow).

## Consequences

**Gains**
- It fits the free tier: no extra service, no extra credentials, one backup story.
- One write path, idempotent per event, covered by the same integration tests as the rest of the backend.
- Dashboard cost is proportional to (links × buckets in range), not to clicks.

**Costs and trade-offs**
- **No ad-hoc queries over raw history.** Any breakdown that isn't in a rollup can't be answered for data older than the raw retention window. Adding a new dimension means a consumer change and, for history, a backfill from raw events inside the retention window.
- **Bounded breakdown maps.** Each rollup map keeps the first N distinct values per bucket and folds the rest into `other` (see architecture.md). These are "first N seen", not a true top N.
- **Approximate unique visitors.** HLL has about 0.8% error. Uniques are per link per day, so a multi-day range reports the *sum of daily uniques*: a visitor who comes back on two days counts twice. The same goes for a user summary across links, where a visitor who clicks two links counts twice. A 24-hour range reports the uniques of the calendar days it touches.
- **Bucket granularity.** A range starting mid-bucket includes the whole first bucket: hourly buckets for ranges of 48 hours or less, daily buckets otherwise.
- **Write amplification.** Each click costs one raw insert, two rollup updates, one `Link.clicks` update and two ledger writes, batched per consumer batch. The benchmark ([benchmarks/README.md](../../benchmarks/README.md)) found the consumer keeping up at about 460 clicks/s on one hot link on a laptop, and falling behind at about 900/s. This is the main reason to reconsider the store, or the per-event update pattern, when traffic grows.

## Adding a dedicated analytics store later

If traffic outgrows the rollups (for example, ad-hoc queries over raw history, or Atlas M0 write limits):

1. Implement another repository with the same methods: `ensureReady`, `recordClicks`, `getLinkAnalytics`, `getUserSummary`, `exportEvents`, `deleteAnalytics`. Key rows by `eventId`, so `recordClicks` stays idempotent under redelivery.
2. Select it in `getAnalyticsRepository()` from an env flag.
3. Backfill it from the MongoDB time-series collection, which the `ClickEventRecord` shape maps onto directly. Run both implementations through a dual-writing repository for one retention window before switching reads.
4. Keep the endpoint tests in `backend/test/integration/analyticsEndpoints.test.js` as the contract both implementations must pass.
