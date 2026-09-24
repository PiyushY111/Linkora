# Benchmarks

A k6 load test for the redirect hot path, `GET /api/r/:shortCode`, plus a
check that every click served was also stored by the analytics pipeline.

## What it measures

`redirect.k6.js` registers a throwaway user, creates one link, and warms the
cache in `setup()`. Every measured request is then a cache hit, which costs
two Redis commands (`HGETALL` and `XADD`) and no MongoDB round trip. Two modes:

- **Closed model** (default): `VUS` clients send requests back to back. This
  finds the maximum request rate and its latency.
- **Open model** (`RATE` set): a fixed number of requests per second whatever
  the latency. This finds the click rate the analytics pipeline can keep up
  with.

`count-clicks.mjs` reads `Link.clicks` and the `click_events` count for the
benchmark link, to compare with the number of redirects served.

## How to run

Start the API against local, disposable data stores. The in-memory global
limiter (`RATE_LIMIT_MAX_REQUESTS`, default 1,500 per 15 minutes per IP)
would otherwise turn a load test into a 429 test, so raise it for the run:

```bash
cd backend
NODE_ENV=production PORT=5099 \
MONGODB_URI=mongodb://127.0.0.1:27017/linkora_bench \
REDIS_URL=redis://127.0.0.1:6379/14 \
JWT_SECRET=benchmark-only-secret-at-least-32-chars-long \
TRUST_PROXY_HOPS=0 WORKER_MODE=embedded RATE_LIMIT_MAX_REQUESTS=100000000 \
node src/server.js
```

Then, from the repository root, with k6 installed:

```bash
k6 run -e BASE_URL=http://localhost:5099 -e VUS=10 -e DURATION=30s benchmarks/redirect.k6.js
k6 run -e BASE_URL=http://localhost:5099 -e RATE=500 -e VUS=50 benchmarks/redirect.k6.js
```

or with Docker (what the results below used):

```bash
docker run --rm -v "$PWD/benchmarks:/scripts" \
  -e BASE_URL=http://host.docker.internal:5099 -e VUS=10 -e DURATION=30s \
  grafana/k6 run /scripts/redirect.k6.js
```

`setup()` logs `benchmark link: <shortCode>`. Once the consumer has caught up
(`redis-cli -n 14 XINFO GROUPS stream:clicks` shows `lag 0` and `pending 0`):

```bash
node benchmarks/count-clicks.mjs <shortCode>
```

The expected click count is the k6 `iterations` count plus one (the warm-up
request in `setup()`).

Clean up afterwards with `redis-cli -n 14 FLUSHDB` and
`mongosh linkora_bench --eval 'db.dropDatabase()'`.

## Results

### 2026-09-24, Apple M3 laptop

| | |
|---|---|
| Hardware | MacBook Pro, Apple M3 (8 cores), 8 GB RAM, macOS 26.6 |
| Runtime | Node 25.2.0, one process, `NODE_ENV=production`, `WORKER_MODE=embedded` (API and click consumer share the process) |
| Data stores | Local MongoDB 8.2.2 and Redis 8.10.2 on the same laptop, default config |
| Load generator | k6 2.3.0 in Docker Desktop on the same laptop, via `host.docker.internal` |
| Config changed | `RATE_LIMIT_MAX_REQUESTS=100000000`, `TRUST_PROXY_HOPS=0`; everything else default (`CLICK_STREAM_MAXLEN=10000`, `CLICK_STREAM_BATCH_SIZE=500`, `LOG_LEVEL=info`) |
| Workload | Every request hits the same, cached, link |

Load generator, API and databases all share one laptop, and Docker Desktop's
networking adds latency. Treat these numbers as a lower bound for a single
instance, not a capacity plan. The raw k6 summaries are in
[`results/2026-09-24-apple-m3/`](results/2026-09-24-apple-m3/).

| Run | Throughput | p50 | p90 | p95 | p99 | Clicks served | Clicks stored | Lost |
|---|---|---|---|---|---|---|---|---|
| Closed, 10 VUs, 30 s | 2,990 req/s | 2.19 ms | 4.67 ms | 6.60 ms | 15.98 ms | 96,945 | 17,168 | 79,777 (82%) |
| Closed, 50 VUs, 30 s ¹ | 3,347 req/s | 10.87 ms | 19.77 ms | 28.09 ms | 57.10 ms | 110,402 | 23,503 | 86,899 (79%) |
| Open, 500 req/s target, 30 s | 463 req/s ² | 0.86 ms | 30.19 ms | 60.93 ms | 237.02 ms | 14,751 | 14,751 | 0 |
| Open, 1,000 req/s target, 30 s | 897 req/s ² | 1.03 ms | 90.67 ms | 178.94 ms | 336.65 ms | 29,180 | 28,937 | 243 (0.8%) |

¹ Taken from the k6 console summary; this run was not exported to JSON.
² Below target because k6 dropped iterations when all pre-allocated VUs were
busy during latency spikes (251 and 822 dropped respectively).

### What the numbers say

- **The redirect path is fast.** One process served about 3,000 cached
  redirects per second, with a 2 ms median at 10 concurrent clients.
- **The click pipeline is much slower than the redirect path, and loses
  clicks when it falls behind.** With every click on one link, the embedded
  consumer kept up at about 460 clicks/s and fell slightly behind at about
  900/s, so its ceiling on this machine is somewhere in between. Past it, the
  backlog grows until `XADD MAXLEN ~ 10000` trims the oldest *unread*
  entries, and those clicks are lost with no log line or metric. At 500
  clicks/s nothing was lost; at about 900/s, 0.8% was; at full redirect speed,
  about 80%. See [docs/KNOWN_BUGS.md](../docs/KNOWN_BUGS.md).
- **Tail latency rises with click volume in embedded mode.** At a fixed
  500 req/s the median is under 1 ms, but p99 is 237 ms. The consumer's batch
  work shares the event loop with request handling. `WORKER_MODE=separate`
  should remove that interference, but it has not been measured.
- **What reached the consumer was stored once.** At 500 req/s, clicks stored
  equalled clicks served exactly (14,751). In every run, `Link.clicks` equals
  the `click_events` count, so the counter and the raw events agree.

Not measured: separate worker mode; clicks spread across many links (likely
a higher consumer ceiling, since every click in these runs updated the same
link and rollup documents, but unverified); cache-miss redirects; multiple
API instances; any cloud deployment.
