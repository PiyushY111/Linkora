import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getRedis } from '../services/cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Every JWT this app issues is HS256 with env.JWT_SECRET. Pinning the
 * algorithm on verify matters: without `algorithms`, jsonwebtoken also
 * accepts HS384/HS512 for an HMAC secret. All signing and verification goes
 * through these two helpers so the pin can't be forgotten at a call site.
 */
export const JWT_ALGORITHM = 'HS256';

/**
 * @param {object} payload
 * @param {import('jsonwebtoken').SignOptions} [options]
 */
export function signJwt(payload, options = {}) {
  return jwt.sign(payload, env.JWT_SECRET, { ...options, algorithm: JWT_ALGORITHM });
}

/**
 * Throws on an invalid, expired, or wrongly-signed token.
 * @param {string} token
 * @param {import('jsonwebtoken').VerifyOptions} [options]
 */
export function verifyJwt(token, options = {}) {
  return jwt.verify(token, env.JWT_SECRET, { ...options, algorithms: [JWT_ALGORITHM] });
}

/**
 * Short-lived (15m) signed access token. Kept as `generateToken` for the
 * existing call sites / frontend response shape (`{ token }`).
 */
export const generateToken = (id) => signJwt({ id }, { expiresIn: env.JWT_ACCESS_TOKEN_TTL });

export const verifyToken = (token) => {
  try {
    return verifyJwt(token);
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

/**
 * Refresh tokens are issued as `${familyId}.${secret}` and rotated on every
 * use (refresh-token rotation). A family survives across rotations so that
 * presenting an already-rotated-out secret can be recognized as token
 * *reuse* — the signature of a stolen-and-replayed token — rather than a
 * simple invalid/expired token. On reuse, the entire family is revoked,
 * logging the legitimate owner out everywhere as a containment measure.
 *
 * Redis layout per family:
 *   refresh:family:{id}:current -> the one currently valid secret
 *   refresh:family:{id}:user    -> the owning userId (stable across rotations)
 */
const familyCurrentKey = (familyId) => `refresh:family:${familyId}:current`;
const familyUserKey = (familyId) => `refresh:family:${familyId}:user`;

function packToken(familyId, secret) {
  return `${familyId}.${secret}`;
}

function unpackToken(token) {
  const idx = typeof token === 'string' ? token.indexOf('.') : -1;
  if (idx <= 0 || idx === token.length - 1) return null;
  return { familyId: token.slice(0, idx), secret: token.slice(idx + 1) };
}

/**
 * Issues (or rotates) a refresh token. Pass `familyId` when rotating an
 * existing session so reuse detection stays linked across the chain; omit
 * it for a brand-new session (login/register), which starts a fresh family.
 * @param {string} userId
 * @param {string} [familyId]
 * @returns {Promise<string>}
 */
export async function issueRefreshToken(userId, familyId = crypto.randomBytes(16).toString('hex')) {
  const secret = crypto.randomBytes(40).toString('hex');
  const ttl = env.JWT_REFRESH_TOKEN_TTL_SECONDS;

  await getRedis()
    .multi()
    .set(familyCurrentKey(familyId), secret, 'EX', ttl)
    .set(familyUserKey(familyId), userId, 'EX', ttl)
    .exec();

  return packToken(familyId, secret);
}

/**
 * Atomically validates and consumes a refresh token via a Lua script, so the
 * compare-then-delete can never race (the previous GET-then-DEL was two
 * separate round trips, allowing a token to be redeemed twice under
 * concurrent requests). If the presented secret does not match the family's
 * current secret — i.e. an already-rotated-out token is being replayed —
 * the whole family is revoked immediately and `null` is returned.
 *
 * @param {string} token
 * @param {{ ip?: string }} [context] - for audit logging on reuse detection
 * @returns {Promise<{ userId: string, familyId: string } | null>}
 */
const CONSUME_SCRIPT = `
local currentKey = KEYS[1]
local userKey = KEYS[2]
local presented = ARGV[1]

local current = redis.call('GET', currentKey)
if not current then
  return {0, ''}
end

local userId = redis.call('GET', userKey) or ''

if current ~= presented then
  redis.call('DEL', currentKey)
  redis.call('DEL', userKey)
  return {-1, userId}
end

redis.call('DEL', currentKey)
return {1, userId}
`;

let consumeScriptSha = null;

export async function consumeRefreshToken(token, context = {}) {
  const parsed = unpackToken(token);
  if (!parsed) return null;
  const { familyId, secret } = parsed;

  const keys = [familyCurrentKey(familyId), familyUserKey(familyId)];

  let result;
  try {
    if (!consumeScriptSha) consumeScriptSha = await getRedis().script('LOAD', CONSUME_SCRIPT);
    result = await getRedis().evalsha(consumeScriptSha, 2, ...keys, secret);
  } catch (err) {
    if (!String(err.message).includes('NOSCRIPT')) throw err;
    consumeScriptSha = await getRedis().script('LOAD', CONSUME_SCRIPT);
    result = await getRedis().evalsha(consumeScriptSha, 2, ...keys, secret);
  }

  const [status, userId] = result;

  if (status === 0) return null; // unknown, expired, or already fully revoked

  if (status === -1) {
    logger.warn(
      { familyId, userId: userId || null, ip: context.ip || null },
      'Refresh token reuse detected — revoking token family'
    );
    return null;
  }

  return { userId, familyId };
}

/**
 * Revokes every refresh token in a family (used by logout and by reuse
 * detection). Accepts either a full token or a bare familyId.
 * @param {string} tokenOrFamilyId
 */
export async function revokeRefreshToken(tokenOrFamilyId) {
  const parsed = unpackToken(tokenOrFamilyId);
  const familyId = parsed ? parsed.familyId : tokenOrFamilyId;
  await getRedis().multi().del(familyCurrentKey(familyId)).del(familyUserKey(familyId)).exec();
}
