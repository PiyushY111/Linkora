import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import ApiKey from '../../src/models/ApiKey.js';
import Link from '../../src/models/Link.js';
import User from '../../src/models/User.js';
import { closeRedis } from '../../src/services/cacheService.js';

let user;
let token;
const users = [];

beforeAll(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser());
  users.push(user._id);
});

afterAll(async () => {
  await ApiKey.deleteMany({ user: { $in: users } });
  await Link.deleteMany({ user: { $in: users } });
  await User.deleteMany({ _id: { $in: users } });
  await disconnectTestDb();
  await closeRedis();
});

async function newKey(body = {}, as = token) {
  const res = await request(app).post('/api/developer/keys').set(authHeader(as)).send({ name: 'auth-test', ...body });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return { raw: res.body.rawSecret, id: res.body.key._id, masked: res.body.key.maskedKey };
}

describe('apiKeyAuth', () => {
  it('accepts a valid key and records when it was last used', async () => {
    const { raw, id } = await newKey();
    const res = await request(app).get('/api/public/v1/usage').set('x-api-key', raw);
    assert.strictEqual(res.status, 200);
    for (let i = 0; i < 50 && !(await ApiKey.findById(id).lean()).lastUsedAt; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok((await ApiKey.findById(id).lean()).lastUsedAt);
  });

  it('rejects a missing, unknown, revoked or expired key with 401', async () => {
    const missing = await request(app).get('/api/public/v1/usage');
    assert.strictEqual(missing.status, 401);

    const unknown = await request(app).get('/api/public/v1/usage').set('x-api-key', 'lnk_live_not_a_real_key');
    assert.strictEqual(unknown.status, 401);

    const revoked = await newKey();
    await request(app).delete(`/api/developer/keys/${revoked.id}`).set(authHeader(token));
    assert.strictEqual((await request(app).get('/api/public/v1/usage').set('x-api-key', revoked.raw)).status, 401);

    const expired = await newKey();
    await ApiKey.updateOne({ _id: expired.id }, { expiresAt: new Date(Date.now() - 1000) });
    assert.strictEqual((await request(app).get('/api/public/v1/usage').set('x-api-key', expired.raw)).status, 401);
  });

  it('rejects a key whose owner no longer exists', async () => {
    const { user: gone, token: goneToken } = await createTestUser();
    users.push(gone._id);
    const { raw } = await newKey({}, goneToken);
    await User.deleteOne({ _id: gone._id });
    assert.strictEqual((await request(app).get('/api/public/v1/usage').set('x-api-key', raw)).status, 401);
  });

  it('a rolled key stops working and its replacement works', async () => {
    const { raw, id } = await newKey();
    const rolled = await request(app).post(`/api/developer/keys/${id}/roll`).set(authHeader(token));
    assert.strictEqual(rolled.status, 200);
    assert.strictEqual((await request(app).get('/api/public/v1/usage').set('x-api-key', raw)).status, 401);
    assert.strictEqual((await request(app).get('/api/public/v1/usage').set('x-api-key', rolled.body.rawSecret)).status, 200);
  });
});

describe('requireScope', () => {
  it('enforces the key\'s scopes per route', async () => {
    const { raw } = await newKey({ scopes: ['links:read'] });
    assert.strictEqual((await request(app).get('/api/public/v1/links').set('x-api-key', raw)).status, 200);

    const write = await request(app).post('/api/public/v1/links').set('x-api-key', raw).send({ originalUrl: 'https://example.com' });
    assert.strictEqual(write.status, 403);
    assert.match(write.body.message, /links:write/);

    const del = await request(app).delete('/api/public/v1/links/whatever').set('x-api-key', raw);
    assert.strictEqual(del.status, 403);
  });

  it('drops unknown scopes and falls back to links:read', async () => {
    const res = await request(app)
      .post('/api/developer/keys')
      .set(authHeader(token))
      .send({ name: 'bogus-scopes', scopes: ['admin:everything'] });
    assert.deepStrictEqual(res.body.key.scopes, ['links:read']);
  });
});

describe('dashboard-session fallback (playground and CLI)', () => {
  it('uses the scopes of the masked key the playground names', async () => {
    const { masked } = await newKey({ scopes: ['links:read'] });
    const res = await request(app)
      .post('/api/public/v1/links')
      .set(authHeader(token))
      .set('x-api-key', masked)
      .send({ originalUrl: 'https://example.com' });
    assert.strictEqual(res.status, 403);
  });

  it('treats a placeholder key with a valid session as the session', async () => {
    const res = await request(app).get('/api/public/v1/usage').set(authHeader(token)).set('x-api-key', 'YOUR_API_KEY');
    assert.strictEqual(res.status, 200);
  });

  it('falls through to key auth when the bearer token is invalid', async () => {
    const res = await request(app).get('/api/public/v1/usage').set('Authorization', 'Bearer not-a-jwt');
    assert.strictEqual(res.status, 401);
  });
});

describe('protect (dashboard routes)', () => {
  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { Authorization: 'Basic dXNlcjpwYXNz' }],
    ['"Bearer" with no token', { Authorization: 'Bearer' }],
    ['"Bearer" glued to the token', { Authorization: 'Bearertoken' }],
  ])('401 for %s', async (_label, headers) => {
    const res = await request(app).get('/api/auth/me').set(headers);
    assert.strictEqual(res.status, 401);
    assert.ok(mongoose.connection.readyState === 1);
  });
});
