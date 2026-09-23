/**
 * Vitest globalSetup for the `integration` project: starts one Mongo, one
 * Redis, and one ClickHouse container for the whole test run (not one per
 * file — that would be far too slow), and exposes their connection info to
 * every test file via process.env.
 *
 * If Docker isn't available (no daemon reachable), this does NOT fail the
 * run: it records that fact in process.env.TESTCONTAINERS_READY and lets
 * individual integration suites skip themselves with a clear reason
 * (see test/helpers/containers.js -> requireContainers()). A missing
 * Docker daemon is an environment limitation, not a test failure.
 */
import { MongoDBContainer } from '@testcontainers/mongodb';
import { RedisContainer } from '@testcontainers/redis';
import { GenericContainer } from 'testcontainers';

export default async function setup() {
  let mongoContainer;
  let redisContainer;
  let clickhouseContainer;

  try {
    [mongoContainer, redisContainer, clickhouseContainer] = await Promise.all([
      new MongoDBContainer('mongo:7').start(),
      new RedisContainer('redis:7-alpine').start(),
      new GenericContainer('clickhouse/clickhouse-server:24-alpine')
        .withExposedPorts(8123)
        .withEnvironment({ CLICKHOUSE_SKIP_USER_SETUP: '1' })
        .start(),
    ]);

    process.env.MONGO_TEST_URI = mongoContainer.getConnectionString();
    process.env.REDIS_TEST_URI = redisContainer.getConnectionUrl();
    process.env.CLICKHOUSE_TEST_URL = `http://${clickhouseContainer.getHost()}:${clickhouseContainer.getMappedPort(
      8123
    )}`;
    process.env.TESTCONTAINERS_READY = '1';

    // eslint-disable-next-line no-console
    console.log('[globalSetup] testcontainers ready:', {
      mongo: process.env.MONGO_TEST_URI,
      redis: process.env.REDIS_TEST_URI,
      clickhouse: process.env.CLICKHOUSE_TEST_URL,
    });
  } catch (err) {
    process.env.TESTCONTAINERS_READY = '';
    // eslint-disable-next-line no-console
    console.warn(
      '[globalSetup] Docker/testcontainers unavailable — the integration project will skip every suite ' +
        'that requires it, with a per-suite skip reason. Underlying error:',
      err.message
    );
  }

  return async function teardown() {
    await Promise.allSettled([mongoContainer?.stop(), redisContainer?.stop(), clickhouseContainer?.stop()]);
  };
}
