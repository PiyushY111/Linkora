import mongoose from 'mongoose';
import crypto from 'crypto';
import { env } from '../../src/config/env.js';
import User from '../../src/models/User.js';
import { generateToken } from '../../src/utils/jwt.js';
import { getRedis } from '../../src/services/cacheService.js';

/**
 * Tests never touch the real dev database: they connect to a sibling
 * `<name>_test` database on the same Mongo instance instead, so nothing a
 * developer is looking at locally can be altered by a test run.
 */
function testDbUri() {
  const url = new URL(env.MONGODB_URI);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

export async function connectTestDb() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(testDbUri());
}

export async function disconnectTestDb() {
  await mongoose.connection.close();
}

/**
 * Creates a throwaway user for a test and returns it alongside a valid
 * access token, so tests can hit protected routes with
 * `Authorization: Bearer ${token}`.
 */
export async function createTestUser(overrides = {}) {
  const suffix = crypto.randomBytes(6).toString('hex');
  const user = await User.create({
    name: 'Test User',
    email: `test-${suffix}@example.com`,
    password: 'Password123',
    ...overrides,
  });
  const token = generateToken(user._id);
  return { user, token };
}

export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Clears the given rate-limit windows. Tests share one Redis and always come
 * from the same loopback IP, so without this the hour-long register window
 * fills up across repeated local runs and later runs start seeing 429s.
 * Scoped to named prefixes because test files run in parallel, and wiping
 * another suite's window mid-test would break its own limit assertions.
 * @param {string[]} keyPrefixes - limiter keyPrefix values, e.g. ['register']
 */
export async function resetRateLimits(keyPrefixes) {
  for (const prefix of keyPrefixes) {
    let cursor = '0';
    do {
      const [next, keys] = await getRedis().scan(cursor, 'MATCH', `ratelimit:${prefix}:*`, 'COUNT', 500);
      if (keys.length > 0) await getRedis().del(...keys);
      cursor = next;
    } while (cursor !== '0');
  }
}
