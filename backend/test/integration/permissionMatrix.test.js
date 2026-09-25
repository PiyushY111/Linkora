import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader, resetRateLimits } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import Link from '../../src/models/Link.js';
import ApiKey from '../../src/models/ApiKey.js';
import Webhook from '../../src/models/Webhook.js';
import { getAnalyticsRepository } from '../../src/repositories/analytics/analyticsRepository.js';
import { closeRedis } from '../../src/services/cacheService.js';

// One workspace with a member of every role, all acting in it.
const members = {};
let workspace;
let link;
const createdUsers = [];
let seq = 0;

const ROLES = ['viewer', 'creator', 'admin', 'owner'];

// Every role-gated action, with the lowest role expected to pass. `ok` is
// the success status; anything below minRole must get 403.
const GATED_ACTIONS = [
  { name: 'list links', minRole: 'viewer', ok: 200, send: (r) => r.get('/api/links') },
  { name: 'get a link', minRole: 'viewer', ok: 200, send: (r) => r.get(`/api/links/${link._id}`) },
  {
    name: 'create a link',
    minRole: 'creator',
    ok: 201,
    send: (r) => r.post('/api/links').send({ originalUrl: 'https://example.com/matrix' }),
  },
  { name: 'edit a link', minRole: 'creator', ok: 200, send: (r) => r.put(`/api/links/${link._id}`).send({ title: 'x' }) },
  { name: 'toggle a link', minRole: 'creator', ok: 200, send: (r) => r.patch(`/api/links/${link._id}/toggle`) },
  { name: 'read analytics summary', minRole: 'viewer', ok: 200, send: (r) => r.get('/api/analytics/summary/all') },
  { name: 'read link analytics', minRole: 'viewer', ok: 200, send: (r) => r.get(`/api/analytics/link/${link._id}`) },
  { name: 'export analytics CSV', minRole: 'creator', ok: 200, send: (r) => r.get(`/api/analytics/export?linkId=${link._id}`) },
  { name: 'list API keys', minRole: 'admin', ok: 200, send: (r) => r.get('/api/developer/keys') },
  { name: 'create an API key', minRole: 'admin', ok: 201, send: (r) => r.post('/api/developer/keys').send({ name: 'm' }) },
  { name: 'read API metrics', minRole: 'admin', ok: 200, send: (r) => r.get('/api/developer/metrics') },
  { name: 'read API logs', minRole: 'admin', ok: 200, send: (r) => r.get('/api/developer/logs') },
  { name: 'list webhooks', minRole: 'admin', ok: 200, send: (r) => r.get('/api/webhooks') },
  {
    name: 'create a webhook',
    minRole: 'admin',
    ok: 201,
    send: (r) => r.post('/api/webhooks').send({ url: 'https://example.com/hook', events: ['link.created'] }),
  },
  {
    name: 'invite a member',
    minRole: 'admin',
    ok: 201,
    send: (r) =>
      r.post(`/api/workspaces/${workspace._id}/invites`).send({ email: `m-${crypto.randomBytes(4).toString('hex')}@example.com`, role: 'viewer' }),
  },
];

function as(role) {
  const agent = request(app);
  const withAuth = (req) => req.set(authHeader(members[role].token));
  return {
    get: (path) => withAuth(agent.get(path)),
    post: (path) => withAuth(agent.post(path)),
    put: (path) => withAuth(agent.put(path)),
    patch: (path) => withAuth(agent.patch(path)),
    delete: (path) => withAuth(agent.delete(path)),
  };
}

const outranks = (role, minRole) => ROLES.indexOf(role) >= ROLES.indexOf(minRole);

beforeAll(async () => {
  await connectTestDb();
  await resetRateLimits(['link-creation', 'invite']);

  members.owner = await createTestUser({ name: 'Matrix Owner' });
  createdUsers.push(members.owner.user);
  workspace = members.owner.workspace;

  for (const role of ['viewer', 'creator', 'admin']) {
    members[role] = await createTestUser({ name: `Matrix ${role}` });
    createdUsers.push(members[role].user);
    await Workspace.updateOne({ _id: workspace._id }, { $push: { members: { user: members[role].user._id, role } } });
    await User.updateOne({ _id: members[role].user._id }, { $set: { activeWorkspace: workspace._id } });
  }

  const shortCode = `pm${Date.now().toString(36)}`;
  link = await Link.create({
    originalUrl: 'https://example.com/matrix-link',
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
    user: members.owner.user._id,
    workspace: workspace._id,
  });

  // One recorded click, so the per-click detail has something to trim.
  seq += 1;
  await getAnalyticsRepository().recordClicks([
    {
      eventId: `${Date.now()}-pm-${seq}`,
      linkId: String(link._id),
      userId: String(members.owner.user._id),
      shortCode,
      timestamp: new Date(),
      ip: '203.0.113.7',
      ipHash: 'pm-ip',
      referrerDomain: '',
      device: 'desktop',
      browser: 'Chrome',
      os: 'macOS',
      country: 'US',
      city: 'Austin',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      variantId: null,
      variantName: null,
      isBot: false,
      botName: null,
    },
  ]);
});

afterAll(async () => {
  const userIds = createdUsers.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  const workspaceIds = await Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
  await getAnalyticsRepository().deleteAnalytics({ userId: String(members.owner.user._id) });
  for (const Model of [Link, ApiKey, Webhook]) await Model.deleteMany({ workspace: { $in: workspaceIds } });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('permission matrix, per role per gated action', () => {
  for (const action of GATED_ACTIONS) {
    for (const role of ROLES) {
      const allowed = outranks(role, action.minRole);
      it(`${role} ${allowed ? 'can' : 'cannot'} ${action.name}`, async () => {
        const res = await action.send(as(role));
        if (allowed) {
          assert.strictEqual(res.status, action.ok, JSON.stringify(res.body));
        } else {
          assert.strictEqual(res.status, 403);
          assert.deepStrictEqual(res.body, { success: false, message: `Requires ${action.minRole} role or higher` });
        }
      });
    }
  }
});

describe('per-click analytics detail', () => {
  it('a viewer gets aggregates but no per-click IP/geo rows', async () => {
    const res = await as('viewer').get(`/api/analytics/link/${link._id}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.analytics.totalClicks >= 1);
    assert.deepStrictEqual(res.body.recentClicks, []);
    assert.strictEqual(res.body.detailRestricted, true);
    assert.ok(!JSON.stringify(res.body).includes('203.0.113.7'));

    const summary = await as('viewer').get('/api/analytics/summary/all');
    assert.deepStrictEqual(summary.body.summary.recentClicks, []);
    assert.strictEqual(summary.body.summary.detailRestricted, true);
  });

  it('a creator gets the per-click rows', async () => {
    const res = await as('creator').get(`/api/analytics/link/${link._id}`);
    assert.strictEqual(res.body.detailRestricted, false);
    assert.ok(res.body.recentClicks.some((c) => c.ip === '203.0.113.7'));
  });
});

describe('ownership changes are owner-only', () => {
  it('an admin cannot grant the owner role, demote an owner, or remove one', async () => {
    const promoteViewer = await as('admin')
      .post(`/api/workspaces/${workspace._id}/members`)
      .send({ email: members.viewer.user.email, role: 'owner' });
    assert.strictEqual(promoteViewer.status, 403);
    assert.strictEqual(promoteViewer.body.message, 'Requires owner role or higher');

    const demoteOwner = await as('admin')
      .post(`/api/workspaces/${workspace._id}/members`)
      .send({ email: members.owner.user.email, role: 'viewer' });
    assert.strictEqual(demoteOwner.status, 403);

    const removeOwner = await as('admin').delete(`/api/workspaces/${workspace._id}/members/${members.owner.user._id}`);
    assert.strictEqual(removeOwner.status, 403);

    const inviteOwner = await as('admin')
      .post(`/api/workspaces/${workspace._id}/invites`)
      .send({ email: 'owner-invite@example.com', role: 'owner' });
    assert.strictEqual(inviteOwner.status, 403);

    const stored = await Workspace.findById(workspace._id).lean();
    const roleOf = (id) => stored.members.find((m) => String(m.user) === String(id))?.role;
    assert.strictEqual(roleOf(members.viewer.user._id), 'viewer');
    assert.strictEqual(roleOf(members.owner.user._id), 'owner');
  });

  it('an admin can still change roles below owner; invalid roles are rejected', async () => {
    const extra = await createTestUser({ name: 'Matrix extra' });
    createdUsers.push(extra.user);

    const add = await as('admin')
      .post(`/api/workspaces/${workspace._id}/members`)
      .send({ email: extra.user.email, role: 'creator' });
    assert.strictEqual(add.status, 200);

    const bogus = await as('admin')
      .post(`/api/workspaces/${workspace._id}/members`)
      .send({ email: extra.user.email, role: 'superuser' });
    assert.strictEqual(bogus.status, 400);
  });

  it('the active workspace payload lists what the role may do', async () => {
    const res = await as('viewer').get('/api/auth/me');
    assert.deepStrictEqual([...res.body.activeWorkspace.permissions].sort(), ['analytics:read', 'links:read']);
  });
});
