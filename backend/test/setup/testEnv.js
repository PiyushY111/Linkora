/**
 * Connection settings for the test run, shared by vitest.config.js (which
 * injects them into every worker's process.env) and the global setup.
 * Tests get their own Redis logical database so they never read or clutter
 * the developer's dev data, and so the key-hygiene check sees only keys the
 * test run itself created.
 */
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/15';
