import { defineConfig } from 'vitest/config';
import { TEST_REDIS_URL } from './test/setup/testEnv.js';

export default defineConfig({
  test: {
    environment: 'node',
    // Several suites talk to real Mongo/Redis and do DNS lookups, so the 5s
    // default is too tight for their setup hooks.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: { REDIS_URL: TEST_REDIS_URL },
    projects: [
      {
        extends: true,
        test: {
          name: 'suites',
          include: ['test/{unit,security,integration}/**/*.test.js'],
          globalSetup: ['test/setup/redisTestDb.js'],
        },
      },
      {
        // Runs after every other project has finished, and inspects what
        // they left in Redis.
        extends: true,
        test: {
          name: 'redis-hygiene',
          include: ['test/hygiene/**/*.test.js'],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
