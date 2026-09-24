import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import { closeRedis, getRedis } from '../../src/services/cacheService.js';
import { issueRefreshToken } from '../../src/utils/jwt.js';

let user;
let token;

beforeAll(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser());
});

afterAll(async () => {
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

// Right secret, wrong algorithm. jsonwebtoken accepts HS384/HS512 for an
// HMAC secret unless `algorithms` is pinned on verify.
const signHs512 = (payload, options = {}) =>
  jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS512', expiresIn: '5m', ...options });

describe('protect (dashboard auth)', () => {
  it('accepts a valid HS256 access token', async () => {
    const res = await request(app).get('/api/auth/me').set(authHeader(token));
    assert.strictEqual(res.status, 200);
  });

  it('rejects a token signed with HS512, even with the right secret', async () => {
    const res = await request(app).get('/api/auth/me').set(authHeader(signHs512({ id: String(user._id) })));
    assert.strictEqual(res.status, 401);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign({ id: String(user._id) }, 'some-other-secret-value-1234567890', { expiresIn: '5m' });
    const res = await request(app).get('/api/auth/me').set(authHeader(forged));
    assert.strictEqual(res.status, 401);
  });

  it('verifies with the validated env.JWT_SECRET, not a later process.env value', async () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'changed-at-runtime-and-must-be-ignored';
    try {
      const res = await request(app).get('/api/auth/me').set(authHeader(token));
      assert.strictEqual(res.status, 200);
    } finally {
      process.env.JWT_SECRET = original;
    }
  });

  it('returns 401, not 404, when the token belongs to a deleted user', async () => {
    const { user: doomed, token: doomedToken } = await createTestUser();
    await mongoose.model('User').deleteOne({ _id: doomed._id });

    const res = await request(app).get('/api/auth/me').set(authHeader(doomedToken));
    assert.strictEqual(res.status, 401);
  });
});

describe('apiKeyAuth dashboard-session fallback', () => {
  it('rejects an HS512 bearer token', async () => {
    const res = await request(app).get('/api/public/v1/usage').set(authHeader(signHs512({ id: String(user._id) })));
    assert.strictEqual(res.status, 401);
  });
});

describe('link unlock tokens', () => {
  it('rejects an HS512 unlock token for the right link and jti', async () => {
    const createRes = await request(app)
      .post('/api/links')
      .set(authHeader(token))
      .send({ originalUrl: 'https://example.com/hs512', password: 'correct-horse' });
    assert.strictEqual(createRes.status, 201);
    const { shortCode } = createRes.body.link;

    // Everything about this token is right except the algorithm, including
    // the single-use marker the server would have stored.
    const jti = crypto.randomBytes(16).toString('hex');
    await getRedis().set(`link:unlock:${jti}`, '1', 'EX', 60);
    const forged = signHs512({ shortCode, jti }, { audience: 'link-unlock' });

    const res = await request(app).get(`/api/r/${shortCode}`).query({ unlockToken: forged });
    assert.strictEqual(res.status, 403);
    await getRedis().del(`link:unlock:${jti}`);
  });
});

describe('refresh for a deleted user', () => {
  it('returns 401 and does not issue an access token', async () => {
    const { user: doomed } = await createTestUser();
    const refreshToken = await issueRefreshToken(String(doomed._id));
    await mongoose.model('User').deleteOne({ _id: doomed._id });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', new URL(env.FRONTEND_URL).origin)
      .set('Cookie', `refreshToken=${refreshToken}`);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.token, undefined);
  });
});
