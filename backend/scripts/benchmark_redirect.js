// NODE_ENV=test, not development: app.js caps the in-process rate limiter at
// 5,000 per window in development and ignores RATE_LIMIT_MAX_REQUESTS there.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn';
process.env.RATE_LIMIT_MAX_REQUESTS = '500000';

import http from 'http';
import autocannon from 'autocannon';
import mongoose from 'mongoose';

async function runBenchmark() {
  const { default: app } = await import('../src/app.js');
  const { env } = await import('../src/config/env.js');
  const { setLinkMeta, closeRedis } = await import('../src/services/cacheService.js');
  const { default: Link } = await import('../src/models/Link.js');
  const { default: User } = await import('../src/models/User.js');
  console.log('================================================================');
  console.log('         LINKORA — FAST-PATH REDIRECT LOAD BENCHMARK            ');
  console.log('================================================================\n');

  // 1. Connect to Database
  console.log('Connecting to MongoDB & Redis...');
  await mongoose.connect(env.MONGODB_URI);

  // 2. Seed a benchmark user & short link
  const shortCode = 'bench_load_test';
  const targetUrl = 'https://linkora.dev/production-target';

  let user = await User.findOne({ email: 'benchmark@linkora.dev' });
  if (!user) {
    user = await User.create({
      name: 'Benchmark Runner',
      email: 'benchmark@linkora.dev',
      password: 'BenchmarkPassword123!',
      plan: 'pro',
    });
  }

  await Link.findOneAndUpdate(
    { shortCode },
    {
      user: user._id,
      originalUrl: targetUrl,
      shortCode,
      shortUrl: `http://localhost/${shortCode}`,
      isActive: true,
      clicks: 0,
      routingType: 'direct',
    },
    { upsert: true, new: true }
  );

  // 3. Pre-warm Redis Cache (Hot fast-path simulation)
  await setLinkMeta(shortCode, {
    originalUrl: targetUrl,
    isActive: true,
    expiryDate: 0,
    passwordHash: '',
    linkId: 'bench-link-id',
    userId: String(user._id),
    maxClicks: 0,
    routingType: 'direct',
    computeDelta: 20,
    cachedAt: Date.now(),
  });
  console.log(`Pre-warmed Redis cache for shortCode: ${shortCode}\n`);

  // 4. Start HTTP Server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const benchmarkUrl = `http://127.0.0.1:${port}/api/r/${shortCode}`;
  console.log(`Server listening on ${benchmarkUrl}`);

  // 5. Run Autocannon Load Test
  console.log('Running Autocannon: 100 concurrent connections, 10s duration...');
  const result = await autocannon({
    url: benchmarkUrl,
    connections: 100,
    pipelining: 1,
    duration: 10,
    headers: {
      'User-Agent': 'Linkora-Benchmark-Agent/1.0',
    },
  });

  console.log('\n================================================================');
  console.log('                    BENCHMARK RESULTS                           ');
  console.log('================================================================');
  console.log(`URL Tested:           ${benchmarkUrl}`);
  console.log(`Duration:             ${result.duration}s`);
  console.log(`Total Requests:       ${result.requests.total}`);
  console.log(`Requests / Second:    ${result.requests.average} req/s`);
  console.log(`Throughput:           ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
  console.log(`Errors / Non-2xx:     ${result.errors + result.non2xx} (Expected 307 redirects counted as non-2xx)`);
  console.log(`2xx / 3xx Responses:  ${result['3xx'] || result.requests.total}`);
  console.log('----------------------------------------------------------------');
  console.log('Latency Percentiles:');
  console.log(`  p50 (Median):       ${result.latency.p50} ms`);
  console.log(`  p75:                ${result.latency.p75} ms`);
  console.log(`  p90:                ${result.latency.p90} ms`);
  console.log(`  p99:                ${result.latency.p99} ms`);
  console.log(`  p99.9:              ${result.latency.p99_9 || result.latency.max} ms`);
  console.log(`  Min:                ${result.latency.min} ms`);
  console.log(`  Max:                ${result.latency.max} ms`);
  console.log('================================================================\n');

  // 6. Cleanup
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await closeRedis();

  return result;
}

runBenchmark().catch(async (err) => {
  console.error('Benchmark execution error:', err);
  try {
    await mongoose.disconnect();
    await closeRedis();
  } catch {}
  process.exit(1);
});
