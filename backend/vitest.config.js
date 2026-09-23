import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Several suites still talk to real Mongo/Redis and do DNS lookups, so
    // the 5s default is too tight for their setup hooks.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
