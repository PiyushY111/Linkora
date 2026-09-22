import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { redis } from '../services/cacheService.js';
import { env } from '../config/env.js';

/**
 * Short-lived (15m) signed access token. Kept as `generateToken` for the
 * existing call sites / frontend response shape (`{ token }`); the refresh
 * flow below is additive, not a breaking change to the current API.
 */
export const generateToken = (id) => {
  return jwt.sign({ id }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TOKEN_TTL,
  });
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    return null;
  }
};

export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
};

const refreshTokenKey = (token) => `refresh_token:${token}`;

/**
 * Issues an opaque refresh token, stored server-side in Redis (never a JWT
 * itself, so it can't be inspected or forged) with a TTL and no reuse.
 * @param {string} userId
 * @returns {Promise<string>}
 */
export async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  await redis.set(refreshTokenKey(token), userId, 'EX', env.JWT_REFRESH_TOKEN_TTL_SECONDS);
  return token;
}

/**
 * Validates a refresh token and immediately deletes it (single-use), so a
 * replayed/stolen-but-already-used token is rejected. Returns the
 * associated userId, or null if the token is invalid, expired, or already
 * consumed.
 * @param {string} token
 * @returns {Promise<string | null>}
 */
export async function consumeRefreshToken(token) {
  const key = refreshTokenKey(token);
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key);
  return userId;
}

/**
 * @param {string} token
 */
export async function revokeRefreshToken(token) {
  await redis.del(refreshTokenKey(token));
}
