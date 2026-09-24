// Load test for the redirect hot path: GET /api/r/:shortCode on a cached link.
//
// setup() registers a throwaway user, creates one link, and warms the cache,
// so every measured request is a cache hit (HGETALL + XADD, no MongoDB).
// See benchmarks/README.md for how to run it and how results were recorded.
import http from 'k6/http';
import { check, fail } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5001';
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '30s';
// RATE set: open model, a fixed number of requests per second regardless of
// latency (for finding what the click pipeline can sustain). RATE unset:
// closed model, VUS concurrent clients as fast as they can go.
const RATE = __ENV.RATE ? Number(__ENV.RATE) : null;

const scenario = RATE
  ? {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: VUS,
      maxVUs: VUS * 4,
    }
  : { executor: 'constant-vus', vus: VUS, duration: DURATION };

export const options = {
  scenarios: { cached_redirect: scenario },
  thresholds: {
    // The run fails if more than 1% of requests are not a 307.
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const json = { headers: { 'Content-Type': 'application/json' } };

export function setup() {
  const email = `bench-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const register = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({ name: 'Benchmark', email, password: 'Benchmark123' }),
    json
  );
  if (register.status !== 201) fail(`register failed: ${register.status} ${register.body}`);
  const { token } = register.json();

  const created = http.post(
    `${BASE_URL}/api/links`,
    JSON.stringify({ originalUrl: 'https://example.com/benchmark' }),
    { headers: { ...json.headers, Authorization: `Bearer ${token}` } }
  );
  if (created.status !== 201) fail(`link create failed: ${created.status} ${created.body}`);
  const { shortCode } = created.json().link;

  // Warm the cache so the measured phase is all cache hits.
  const warm = http.get(`${BASE_URL}/api/r/${shortCode}`, { redirects: 0 });
  if (warm.status !== 307) fail(`warm-up redirect returned ${warm.status}`);
  console.log(`benchmark link: ${shortCode}`);
  return { shortCode };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/api/r/${data.shortCode}`, { redirects: 0, tags: { name: 'GET /api/r/:shortCode' } });
  check(res, { 'status is 307': (r) => r.status === 307 });
}
