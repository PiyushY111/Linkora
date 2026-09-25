import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader, resetRateLimits } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import Link from '../../src/models/Link.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { permissionsForRole } from '../../src/utils/permissions.js';

// member belongs to their own personal workspace and, as a creator, to the
// owner's team workspace. stranger belongs to neither of the owner's.
let owner;
let member;
let stranger;
let teamWorkspace;
const createdUsers = [];

async function makeUser(name, overrides = {}) {
  const created = await createTestUser({ name, ...overrides });
  createdUsers.push(created.user);
  return created;
}

beforeAll(async () => {
  await connectTestDb();
  await resetRateLimits(['login']);
  owner = await makeUser('Team Owner');
  member = await makeUser('Team Member', { email: `aw-member-${Date.now()}@example.com` });
  stranger = await makeUser('Stranger');

  teamWorkspace = owner.workspace;
  await Workspace.updateOne({ _id: teamWorkspace._id }, { $push: { members: { user: member.user._id, role: 'creator' } } });
});

afterAll(async () => {
  const userIds = createdUsers.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  const workspaceIds = await Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
  await Link.deleteMany({ workspace: { $in: workspaceIds } });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('auth responses carry the active workspace', () => {
  it('login returns the active workspace and the caller role in it', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: member.user.email, password: 'Password123' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.activeWorkspace, {
      id: String(member.workspace._id),
      name: 'Personal',
      role: 'owner',
      roleName: 'owner',
      permissions: permissionsForRole('owner'),
      settings: { defaultDomain: null, defaultQrStyle: null, defaultUtmParams: null },
    });
  });

  it('GET /me returns the active workspace alongside the user', async () => {
    const res = await request(app).get('/api/auth/me').set(authHeader(owner.token));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.email, owner.user.email);
    assert.deepStrictEqual(res.body.activeWorkspace, {
      id: String(teamWorkspace._id),
      name: 'Personal',
      role: 'owner',
      roleName: 'owner',
      permissions: permissionsForRole('owner'),
      settings: { defaultDomain: null, defaultQrStyle: null, defaultUtmParams: null },
    });
  });
});

describe('PUT /api/auth/me/active-workspace', () => {
  it('switches a member into another workspace they belong to, and later requests act in it', async () => {
    const teamLink = await Link.create({
      originalUrl: 'https://example.com/team',
      shortCode: `aw${Date.now().toString(36)}`,
      shortUrl: `http://localhost/aw${Date.now().toString(36)}`,
      user: owner.user._id,
      workspace: teamWorkspace._id,
    });

    const before = await request(app).get(`/api/links/${teamLink._id}`).set(authHeader(member.token));
    assert.strictEqual(before.status, 404);

    const res = await request(app)
      .put('/api/auth/me/active-workspace')
      .set(authHeader(member.token))
      .send({ workspaceId: String(teamWorkspace._id) });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.email, member.user.email);
    assert.deepStrictEqual(res.body.activeWorkspace, {
      id: String(teamWorkspace._id),
      name: teamWorkspace.name,
      role: 'creator',
      roleName: 'creator',
      permissions: permissionsForRole('creator'),
      settings: { defaultDomain: null, defaultQrStyle: null, defaultUtmParams: null },
    });

    const stored = await User.findById(member.user._id);
    assert.strictEqual(String(stored.activeWorkspace), String(teamWorkspace._id));

    const after = await request(app).get(`/api/links/${teamLink._id}`).set(authHeader(member.token));
    assert.strictEqual(after.status, 200);

    const me = await request(app).get('/api/auth/me').set(authHeader(member.token));
    assert.strictEqual(me.body.activeWorkspace.role, 'creator');
  });

  it("refuses a workspace the caller isn't a member of, and leaves their active workspace alone", async () => {
    const res = await request(app)
      .put('/api/auth/me/active-workspace')
      .set(authHeader(stranger.token))
      .send({ workspaceId: String(teamWorkspace._id) });
    assert.strictEqual(res.status, 403);

    const stored = await User.findById(stranger.user._id);
    assert.strictEqual(String(stored.activeWorkspace), String(stranger.workspace._id));
  });

  it('404s an unknown or malformed workspace id and 400s a missing one', async () => {
    const unknown = await request(app)
      .put('/api/auth/me/active-workspace')
      .set(authHeader(stranger.token))
      .send({ workspaceId: '0123456789abcdef01234567' });
    assert.strictEqual(unknown.status, 404);

    const malformed = await request(app)
      .put('/api/auth/me/active-workspace')
      .set(authHeader(stranger.token))
      .send({ workspaceId: 'not-an-id' });
    assert.strictEqual(malformed.status, 404);

    const missing = await request(app).put('/api/auth/me/active-workspace').set(authHeader(stranger.token)).send({});
    assert.strictEqual(missing.status, 400);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .put('/api/auth/me/active-workspace')
      .send({ workspaceId: String(teamWorkspace._id) });
    assert.strictEqual(res.status, 401);
  });
});
