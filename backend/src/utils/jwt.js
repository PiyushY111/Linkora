import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getRedis } from '../services/cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const JWT_ALGORITHM = 'HS256';

/**
 * Every JWT this app issues is HS256 over JWT_SECRET, so the audience claim
 * is what tells one kind from another. verifyJwt() requires it, so an unlock
 * token can't be presented as an access token or the reverse. (Refresh
 * tokens and SSO state aren't JWTs: they're random values checked against
 * Redis.)
 */
export const TOKEN_AUDIENCE = Object.freeze({
  ACCESS: 'access',
  LINK_UNLOCK: 'link-unlock',
});

/**
 * @param {object} payload
 * @param {{ audience: string, expiresIn: string | number }} options
 * @returns {string}
 */
export function signJwt(payload, { audience, expiresIn }) {
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: JWT_ALGORITHM, audience, expiresIn });
}

/**
 * Verifies signature, algorithm (HS256 only; `none` and every other
 * algorithm are rejected), expiry and audience. Throws a jsonwebtoken error
 * if any check fails.
 * @param {string} token
 * @param {string} audience
 * @returns {object} the payload
 */
export function verifyJwt(token, audience) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM], audience });
}

/**
 * How a session signed in. Carried in access tokens and stored with each
 * refresh-token family so it survives rotation. SSO enforcement and "prove
 * SSO works before enforcing it" read it.
 * @typedef {{ authMethod: 'password' | 'sso', ssoConnectionId?: string | null }} SessionAuth
 */
export const PASSWORD_AUTH = Object.freeze({ authMethod: 'password', ssoConnectionId: null });

function normalizeAuth(auth) {
  return auth?.authMethod === 'sso'
    ? { authMethod: 'sso', ssoConnectionId: auth.ssoConnectionId ?? null }
    : PASSWORD_AUTH;
}

/**
 * Short-lived (15m) signed access token. Kept as `generateToken` for the
 * existing call sites / frontend response shape (`{ token }`).
 * @param {unknown} id
 * @param {SessionAuth} [auth] - defaults to a password session
 */
export const generateToken = (id, auth = PASSWORD_AUTH) =>
  signJwt({ id, ...normalizeAuth(auth) }, { audience: TOKEN_AUDIENCE.ACCESS, expiresIn: env.JWT_ACCESS_TOKEN_TTL });

/**
 * The SessionAuth recorded in a verified access-token payload. Tokens issued
 * before sessions recorded this count as password sessions.
 * @param {object} payload
 * @returns {SessionAuth}
 */
export const sessionAuthFromToken = (payload) => normalizeAuth(payload);

/**
 * @param {string} token
 * @returns {object} the payload; throws if the token isn't a valid access token
 */
export const verifyAccessToken = (token) => verifyJwt(token, TOKEN_AUDIENCE.ACCESS);

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
 *   refresh:family:{id}:auth    -> SessionAuth JSON (how the session signed in)
 * and per user:
 *   refresh:user:{userId}:families -> set of that user's family ids, so
 *     sessions can be revoked by kind (see revokeUserSessions)
 */
const familyCurrentKey = (familyId) => `refresh:family:${familyId}:current`;
const familyUserKey = (familyId) => `refresh:family:${familyId}:user`;
const familyAuthKey = (familyId) => `refresh:family:${familyId}:auth`;
const userFamiliesKey = (userId) => `refresh:user:${userId}:families`;

function parseAuth(raw) {
  if (!raw) return PASSWORD_AUTH; // families created before auth was recorded
  try {
    return normalizeAuth(JSON.parse(raw));
  } catch {
    return PASSWORD_AUTH;
  }
}

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
 * Pass the session's `auth` on rotation too (consumeRefreshToken returns it).
 * @param {string} userId
 * @param {string} [familyId]
 * @param {SessionAuth} [auth] - defaults to a password session
 * @returns {Promise<string>}
 */
export async function issueRefreshToken(userId, familyId = crypto.randomBytes(16).toString('hex'), auth = PASSWORD_AUTH) {
  const secret = crypto.randomBytes(40).toString('hex');
  const ttl = env.JWT_REFRESH_TOKEN_TTL_SECONDS;

  await getRedis()
    .multi()
    .set(familyCurrentKey(familyId), secret, 'EX', ttl)
    .set(familyUserKey(familyId), userId, 'EX', ttl)
    .set(familyAuthKey(familyId), JSON.stringify(normalizeAuth(auth)), 'EX', ttl)
    .sadd(userFamiliesKey(userId), familyId)
    .expire(userFamiliesKey(userId), ttl)
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
 * @returns {Promise<{ userId: string, familyId: string, auth: SessionAuth } | null>}
 */
const CONSUME_SCRIPT = `
local currentKey = KEYS[1]
local userKey = KEYS[2]
local authKey = KEYS[3]
local presented = ARGV[1]

local current = redis.call('GET', currentKey)
if not current then
  return {0, '', ''}
end

local userId = redis.call('GET', userKey) or ''
local auth = redis.call('GET', authKey) or ''

if current ~= presented then
  redis.call('DEL', currentKey)
  redis.call('DEL', userKey)
  redis.call('DEL', authKey)
  return {-1, userId, ''}
end

redis.call('DEL', currentKey)
return {1, userId, auth}
`;

let consumeScriptSha = null;

export async function consumeRefreshToken(token, context = {}) {
  const parsed = unpackToken(token);
  if (!parsed) return null;
  const { familyId, secret } = parsed;

  const keys = [familyCurrentKey(familyId), familyUserKey(familyId), familyAuthKey(familyId)];

  let result;
  try {
    if (!consumeScriptSha) consumeScriptSha = await getRedis().script('LOAD', CONSUME_SCRIPT);
    result = await getRedis().evalsha(consumeScriptSha, keys.length, ...keys, secret);
  } catch (err) {
    if (!String(err.message).includes('NOSCRIPT')) throw err;
    consumeScriptSha = await getRedis().script('LOAD', CONSUME_SCRIPT);
    result = await getRedis().evalsha(consumeScriptSha, keys.length, ...keys, secret);
  }

  const [status, userId, rawAuth] = result;

  if (status === 0) return null; // unknown, expired, or already fully revoked

  if (status === -1) {
    logger.warn(
      { familyId, userId: userId || null, ip: context.ip || null },
      'Refresh token reuse detected — revoking token family'
    );
    return null;
  }

  return { userId, familyId, auth: parseAuth(rawAuth) };
}

/**
 * Revokes every refresh token in a family (used by logout and by reuse
 * detection). Accepts either a full token or a bare familyId.
 * @param {string} tokenOrFamilyId
 */
export async function revokeRefreshToken(tokenOrFamilyId) {
  const parsed = unpackToken(tokenOrFamilyId);
  const familyId = parsed ? parsed.familyId : tokenOrFamilyId;
  await getRedis()
    .multi()
    .del(familyCurrentKey(familyId))
    .del(familyUserKey(familyId))
    .del(familyAuthKey(familyId))
    .exec();
}

/**
 * Revokes the user's refresh-token families for which `shouldRevoke(auth)`
 * is true (e.g. every password session when an org starts enforcing SSO),
 * and prunes ids of families that have already expired.
 * @param {string} userId
 * @param {(auth: SessionAuth) => boolean} shouldRevoke
 * @returns {Promise<number>} how many live sessions were revoked
 */
export async function revokeUserSessions(userId, shouldRevoke) {
  const redis = getRedis();
  const familyIds = await redis.smembers(userFamiliesKey(userId));
  let revoked = 0;

  for (const familyId of familyIds) {
    const [current, rawAuth] = await redis.mget(familyCurrentKey(familyId), familyAuthKey(familyId));
    if (!current) {
      await redis.srem(userFamiliesKey(userId), familyId);
      continue;
    }
    if (shouldRevoke(parseAuth(rawAuth))) {
      await revokeRefreshToken(familyId);
      await redis.srem(userFamiliesKey(userId), familyId);
      revoked += 1;
    }
  }
  return revoked;
}
