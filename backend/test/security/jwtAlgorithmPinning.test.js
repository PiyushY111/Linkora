import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';
import User from '../../src/models/User.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { signJwt, verifyJwt, issueRefreshToken, TOKEN_AUDIENCE } from '../../src/utils/jwt.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';

// Every forged token below carries a real user's id, a valid expiry and
// (where relevant) the access audience, so the only thing wrong with it is
// the property under test.
let user;
let validToken;

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function unsignedToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'none', typ: 'JWT' });
  const body = base64url({ ...payload, iat: now, exp: now + 900 });
  return `${header}.${body}.`;
}

beforeAll(async () => {
  await connectTestDb();
  ({ user, token: validToken } = await createTestUser());
});

afterAll(async () => {
  await User.deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('JWT algorithm pinning and token-type separation', () => {
  it('accepts a genuine access token (control)', async () => {
    const res = await request(app).get('/api/auth/me').set(authHeader(validToken));
    assert.strictEqual(res.status, 200);
  });

  it('rejects an access token signed with a different HMAC algorithm (HS512)', async () => {
    const token = jwt.sign({ id: String(user._id) }, env.JWT_SECRET, {
      algorithm: 'HS512',
      audience: TOKEN_AUDIENCE.ACCESS,
      expiresIn: '15m',
    });

    const res = await request(app).get('/api/auth/me').set(authHeader(token));
    assert.strictEqual(res.status, 401);
  });

  it('rejects an unsigned alg: none token', async () => {
    const token = unsignedToken({ id: String(user._id), aud: TOKEN_AUDIENCE.ACCESS });

    const res = await request(app).get('/api/auth/me').set(authHeader(token));
    assert.strictEqual(res.status, 401);
  });

  it('rejects an alg: none token on the public API session path too', async () => {
    const token = unsignedToken({ id: String(user._id), aud: TOKEN_AUDIENCE.ACCESS });

    // No X-API-Key: a rejected session token must not authenticate the
    // request, so it falls through to "missing API key".
    const res = await request(app).get('/api/public/v1/links').set(authHeader(token));
    assert.strictEqual(res.status, 401);
  });

  it('rejects an access token with no audience (the pre-audience format)', async () => {
    const token = jwt.sign({ id: String(user._id) }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m' });

    const res = await request(app).get('/api/auth/me').set(authHeader(token));
    assert.strictEqual(res.status, 401);
  });

  it('rejects a link-unlock token used as an access token', async () => {
    const token = signJwt(
      { id: String(user._id), shortCode: 'abc123', jti: 'x' },
      { audience: TOKEN_AUDIENCE.LINK_UNLOCK, expiresIn: 60 }
    );

    const res = await request(app).get('/api/auth/me').set(authHeader(token));
    assert.strictEqual(res.status, 401);
  });

  it('rejects an access token used as a link-unlock token', () => {
    assert.throws(() => verifyJwt(validToken, TOKEN_AUDIENCE.LINK_UNLOCK), jwt.JsonWebTokenError);
  });

  it('rejects a refresh token used as an access token', async () => {
    const refreshToken = await issueRefreshToken(String(user._id));

    const res = await request(app).get('/api/auth/me').set(authHeader(refreshToken));
    assert.strictEqual(res.status, 401);
  });
});
