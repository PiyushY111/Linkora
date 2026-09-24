# ADR 0006: One Redis database

- **Status:** Accepted (2026-09-23)
- **Supersedes:** the earlier two-instance setup (an evictable cache instance plus a non-evicting "core" instance), which was never written up as an ADR

## Context

The earlier design ran two Redis roles: a core instance (`REDIS_URL`, `noeviction`) for streams, tokens and rate limits, and a cache instance (`REDIS_CACHE_URL`, `allkeys-lru`) for link metadata. The point was that cache pressure could never evict a refresh token or a usage counter.

Free tiers give one small Redis database: Upstash's free tier has one database, 256 MB, and a monthly command budget. A second database means a paid plan.

## Decision

Use one Redis database for everything, and replace "an evicting instance for the cache" with **"no key without a bound"**:

- Every key has a TTL or a hard size cap. The only uncapped-by-TTL keys are the two streams, which are bounded by `XADD MAXLEN ~`.
- The instance runs `noeviction`, which the non-cache data requires.
- Every key family and its bound is listed in [docs/redis-keys.md](../redis-keys.md). (An earlier version of this ADR quoted a 46 MiB steady-state estimate; that calculation is not in the repository, so it is not repeated here.)
- A test fails if any key other than the capped streams is left without a TTL.

Code keeps the role split explicit: `getRedis()` and `getCacheRedis()` both return the one client today, so splitting later touches only `getCacheRedis()`.

## Consequences

- With `noeviction`, a full instance **rejects writes** instead of evicting. Redirects keep working, because cache writes are best-effort and a cache read miss falls back to MongoDB. But click events, logins and rate limits would fail. The TTLs and caps are what keep this from happening.
- `link:meta:*` TTL drops from 24 h to 1 h, trading memory for more MongoDB reads on cache misses.
- The `maxClicks` usage counter now has a sliding 7-day TTL. After an idle week it's re-seeded from `Link.clicks`, which the consumer keeps current.
- Consumer downtime, or a consumer slower than the click rate, is bounded by `CLICK_STREAM_MAXLEN`. Beyond it, the oldest unprocessed clicks are trimmed and lost. Only entries trimmed while already pending are logged; entries trimmed before any consumer read them are lost silently ([KNOWN_BUGS](../KNOWN_BUGS.md)).

## Alternatives considered

- **Two free Redis providers** (for example Upstash plus Redis Cloud): two sets of credentials, two failure domains, and cross-provider latency, just for eviction isolation that the TTL discipline gives more cheaply.
- **`volatile-lru` on one instance**, evicting only keys with a TTL: every key here has a TTL, including tokens and rate limits, so this would still evict correctness-critical keys under pressure.
