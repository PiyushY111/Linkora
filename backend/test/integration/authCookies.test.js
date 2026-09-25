import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, resetRateLimits } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import { closeRedis } from '../../src/services/cacheService.js';

const createdEmails = [];

beforeAll(async () => {
  await connectTestDb();
  await resetRateLimits(['register', 'refresh']);
});
afterAll(async () => {
  // Register provisions a personal org + workspace per user; remove those too.
  const userIds = await User.find({ email: { $in: createdEmails } }).distinct('_id');
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  await Workspace.deleteMany({ organization: { $in: orgIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ email: { $in: createdEmails } });
  await disconnectTestDb();
  await closeRedis();
});

function findCookie(setCookieHeader, name) {
  return (setCookieHeader || []).find((c) => c.startsWith(`${name}=`));
}

describe('auth: httpOnly refresh cookie', () => {
  it('register returns the access token in the body but the refresh token only as a cookie', async () => {
    const email = `cookie-test-${Date.now()}@example.com`;
    createdEmails.push(email);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Cookie Test', email, password: 'Password123' });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.refreshToken, undefined, 'refresh token must never appear in the JSON body');

    // Register provisions a personal workspace and reports it as active.
    assert.strictEqual(res.body.activeWorkspace.name, 'Personal');
    assert.strictEqual(res.body.activeWorkspace.role, 'owner');
    const stored = await User.findById(res.body.user.id);
    assert.strictEqual(String(stored.activeWorkspace), String(res.body.activeWorkspace.id));

    const cookie = findCookie(res.headers['set-cookie'], 'refreshToken');
    assert.ok(cookie, 'expected a refreshToken cookie to be set');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\/api\/auth/i);
  });

  it('rejects registration with a password that fails the strength check', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Weak', email: `weak-${Date.now()}@example.com`, password: 'abcdefgh' });
    assert.strictEqual(res.status, 400);
  });

  it('refresh works from the cookie alone and never needs a body', async () => {
    const email = `cookie-refresh-${Date.now()}@example.com`;
    createdEmails.push(email);
    const agent = request.agent(app);

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ name: 'Agent Test', email, password: 'Password123' });
    assert.strictEqual(registerRes.status, 201);

    const refreshRes = await agent.post('/api/auth/refresh').send({});
    assert.strictEqual(refreshRes.status, 200);
    assert.ok(refreshRes.body.token);
    assert.strictEqual(refreshRes.body.refreshToken, undefined);
    assert.deepStrictEqual(refreshRes.body.activeWorkspace, registerRes.body.activeWorkspace);
  });

  it('rejects a refresh attempt with no cookie at all', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    assert.strictEqual(res.status, 401);
  });

  it('rejects a cross-origin Origin header on the refresh endpoint (CSRF guard)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'https://evil.example.com')
      .send({});
    assert.strictEqual(res.status, 403);
  });

  it('logout clears the cookie and the family, so it can no longer refresh', async () => {
    const email = `cookie-logout-${Date.now()}@example.com`;
    createdEmails.push(email);
    const agent = request.agent(app);

    await agent.post('/api/auth/register').send({ name: 'Logout Test', email, password: 'Password123' });
    const logoutRes = await agent.post('/api/auth/logout').send({});
    assert.strictEqual(logoutRes.status, 200);

    const refreshAfterLogout = await agent.post('/api/auth/refresh').send({});
    assert.strictEqual(refreshAfterLogout.status, 401);
  });
});
