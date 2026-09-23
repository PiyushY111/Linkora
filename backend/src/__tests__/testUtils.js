import mongoose from 'mongoose';
import crypto from 'crypto';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';

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
