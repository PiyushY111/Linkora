import Redis from 'ioredis';
import { TEST_REDIS_URL } from './testEnv.js';

/**
 * Vitest globalSetup: empties the dedicated test Redis database before the
 * run. Refuses to touch database 0, the default a developer's app uses.
 */
export default async function setup() {
  const url = new URL(TEST_REDIS_URL);
  const db = Number(url.pathname.slice(1) || 0);
  if (db === 0) {
    throw new Error(`Refusing to FLUSHDB database 0 (${url.host}); point TEST_REDIS_URL at a dedicated database`);
  }
  const client = new Redis(TEST_REDIS_URL);
  try {
    await client.flushdb();
  } finally {
    await client.quit();
  }
}
