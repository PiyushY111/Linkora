import { env } from '../src/config/env.js';
import {
  getLinkMeta,
  setLinkMeta,
  getCacheRedis,
  linkMetaKey,
  xfetchLockKey,
  closeRedis,
} from '../src/services/cacheService.js';

/**
 * Thundering-herd benchmark for XFetch (probabilistic early expiration).
 *
 * For each concurrency level it runs two herds against the same key, each
 * starting from a clean slate (cache key and XFetch lock key deleted):
 *
 *  - baseline: the entry has already expired, so every request misses and
 *    runs the loader itself (plain cache-aside, no XFetch, no lock).
 *  - xfetch:   the entry is seeded near expiry and requests go through
 *    getLinkMeta(). A request that wins the XFetch lock runs the loader in
 *    the background and writes the result back with setLinkMeta(); the rest
 *    are served the cached entry.
 *
 * "Loader calls" counts real invocations of the stub loader, which stands in
 * for the Mongo read and sleeps LOADER_DELAY_MS. XFetch is probabilistic, so
 * every level is repeated RUNS_PER_LEVEL times and reported as mean [min-max].
 *
 * Run it against a local Redis (REDIS_URL=redis://127.0.0.1:6379/15): it
 * writes and deletes the benchmark keys in whatever database REDIS_URL names.
 */

const BENCH_KEY = 'benchmark-stampede-link';
const CONCURRENCY_LEVELS = [10, 50, 100, 250, 500];
const RUNS_PER_LEVEL = 5;
const LOADER_DELAY_MS = 35;
// How much TTL the seeded entry has left when the xfetch herd arrives.
const REMAINING_TTL_MS = 60;

const BENCH_META = {
  originalUrl: 'https://linkora.dev/benchmark',
  isActive: true,
  expiryDate: 0,
  passwordHash: '',
  linkId: 'bench-link-id',
  userId: 'bench-user-id',
  maxClicks: 0,
  routingType: 'direct',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeLoader() {
  const counter = { calls: 0 };
  const load = async () => {
    counter.calls++;
    await sleep(LOADER_DELAY_MS);
    return { ...BENCH_META };
  };
  return { counter, load };
}

async function resetKeys() {
  await getCacheRedis().del(linkMetaKey(BENCH_KEY), xfetchLockKey(BENCH_KEY));
}

/** Runs the loader and writes its result back, timing it as XFetch's delta. */
async function loadAndCache(load) {
  const started = Date.now();
  const meta = await load();
  await setLinkMeta(BENCH_KEY, { ...meta, computeDelta: Date.now() - started });
}

async function runBaselineHerd(concurrency) {
  await resetKeys();
  const { counter, load } = makeLoader();
  const started = Date.now();

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const res = await getLinkMeta(BENCH_KEY);
      if (res.status !== 'hit') await loadAndCache(load);
    })
  );

  const durationMs = Date.now() - started;
  await resetKeys();
  return { loaderCalls: counter.calls, cacheHits: concurrency - counter.calls, durationMs };
}

async function runXfetchHerd(concurrency) {
  await resetKeys();
  await setLinkMeta(BENCH_KEY, {
    ...BENCH_META,
    computeDelta: LOADER_DELAY_MS,
    cachedAt: Date.now() - (env.REDIS_CACHE_TTL_SECONDS * 1000 - REMAINING_TTL_MS),
  });

  const { counter, load } = makeLoader();
  const backgroundRefreshes = [];
  let cacheHits = 0;
  const started = Date.now();

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const res = await getLinkMeta(BENCH_KEY);
      if (res.status !== 'hit') {
        await loadAndCache(load);
        return;
      }
      cacheHits++;
      if (res.shouldRecomputeEarly) backgroundRefreshes.push(loadAndCache(load));
    })
  );

  // The herd is served before the background refresh finishes, as in the
  // redirect path; wait for it only so its loader call is counted.
  const durationMs = Date.now() - started;
  await Promise.all(backgroundRefreshes);
  await resetKeys();
  return { loaderCalls: counter.calls, cacheHits, durationMs };
}

function summarize(values) {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { mean, min: Math.min(...values), max: Math.max(...values) };
}

function formatStat({ mean, min, max }, digits = 1) {
  return `${mean.toFixed(digits)} [${min}-${max}]`;
}

async function benchmarkLevel(concurrency) {
  const baseline = [];
  const xfetch = [];
  for (let i = 0; i < RUNS_PER_LEVEL; i++) {
    baseline.push(await runBaselineHerd(concurrency));
    xfetch.push(await runXfetchHerd(concurrency));
  }
  const baselineCalls = summarize(baseline.map((r) => r.loaderCalls));
  const xfetchCalls = summarize(xfetch.map((r) => r.loaderCalls));
  return {
    concurrency,
    baselineCalls,
    baselineDuration: summarize(baseline.map((r) => r.durationMs)),
    xfetchCalls,
    xfetchHits: summarize(xfetch.map((r) => r.cacheHits)),
    xfetchDuration: summarize(xfetch.map((r) => r.durationMs)),
    loadSavedPercent: (1 - xfetchCalls.mean / baselineCalls.mean) * 100,
  };
}

function printTable(rows) {
  const header = [
    'Concurrency',
    'Baseline loader calls',
    'XFetch loader calls',
    'XFetch cache hits',
    'DB load saved',
    'Baseline herd ms',
    'XFetch herd ms',
  ];
  console.log(`| ${header.join(' | ')} |`);
  console.log(`|${header.map(() => '---').join('|')}|`);
  for (const r of rows) {
    const cells = [
      r.concurrency,
      formatStat(r.baselineCalls),
      formatStat(r.xfetchCalls),
      formatStat(r.xfetchHits),
      `${r.loadSavedPercent.toFixed(1)}%`,
      formatStat(r.baselineDuration, 0),
      formatStat(r.xfetchDuration, 0),
    ];
    console.log(`| ${cells.join(' | ')} |`);
  }
}

async function main() {
  console.log('Linkora XFetch cache-stampede benchmark');
  console.log(
    `Loader delay ${LOADER_DELAY_MS}ms, seeded TTL remaining ${REMAINING_TTL_MS}ms, ` +
      `${RUNS_PER_LEVEL} runs per level; values are mean [min-max].\n`
  );

  const rows = [];
  for (const concurrency of CONCURRENCY_LEVELS) {
    process.stdout.write(`concurrency=${concurrency}... `);
    rows.push(await benchmarkLevel(concurrency));
    console.log('done');
  }
  console.log('');
  printTable(rows);
}

main()
  .catch((err) => {
    console.error('Benchmark failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeRedis());
