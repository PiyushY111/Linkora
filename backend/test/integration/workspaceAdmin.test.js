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
import Webhook from '../../src/models/Webhook.js';
import CustomDomain from '../../src/models/CustomDomain.js';
import AuditLog from '../../src/models/AuditLog.js';
import { closeRedis } from '../../src/services/cacheService.js';

// Workspace A (owner's): admin, creator and viewer members, all active in A.
// Workspace B (other's): a separate workspace for cross-workspace checks.
const people = {};
let workspaceA;
let workspaceB;
const createdUsers = [];

async function makeUser(name) {
  const created = await createTestUser({ name });
  createdUsers.push(created.user);
  return created;
}

async function join(member, workspace, role, { activate = true } = {}) {
  await Workspace.updateOne({ _id: workspace._id }, { $push: { members: { user: member.user._id, role } } });
  if (activate) await User.updateOne({ _id: member.user._id }, { $set: { activeWorkspace: workspace._id } });
}

function as(member) {
  const withAuth = (req) => req.set(authHeader(member.token));
  return {
    get: (path) => withAuth(request(app).get(path)),
    post: (path) => withAuth(request(app).post(path)),
    patch: (path) => withAuth(request(app).patch(path)),
    put: (path) => withAuth(request(app).put(path)),
  };
}

function linkIn(workspace, creator) {
  const code = `wa${crypto.randomBytes(5).toString('hex')}`;
  return Link.create({
    originalUrl: 'https://example.com/admin',
    shortCode: code,
    shortUrl: `http://localhost/${code}`,
    user: creator.user._id,
    workspace: workspace._id,
  });
}

async function roleIn(workspace, member) {
  const ws = await Workspace.findById(workspace._id).lean();
  return ws.members.find((m) => String(m.user) === String(member.user._id))?.role;
}

beforeAll(async () => {
  await connectTestDb();
  await resetRateLimits(['link-creation']);
  people.owner = await makeUser('WA Owner');
  people.admin = await makeUser('WA Admin');
  people.creator = await makeUser('WA Creator');
  people.viewer = await makeUser('WA Viewer');
  people.other = await makeUser('WB Owner');
  workspaceA = people.owner.workspace;
  workspaceB = people.other.workspace;
  await join(people.admin, workspaceA, 'admin');
  await join(people.creator, workspaceA, 'creator');
  await join(people.viewer, workspaceA, 'viewer');
});

afterAll(async () => {
  const userIds = createdUsers.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  const workspaceIds = await Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
  for (const Model of [Link, Webhook, CustomDomain, AuditLog]) await Model.deleteMany({ workspace: { $in: workspaceIds } });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('POST /:workspaceId/transfer-ownership', () => {
  it('is blocked for non-owners, including admins', async () => {
    for (const who of ['admin', 'creator', 'viewer']) {
      const res = await as(people[who])
        .post(`/api/workspaces/${workspaceA._id}/transfer-ownership`)
        .send({ newOwnerUserId: String(people[who].user._id) });
      assert.strictEqual(res.status, 403, who);
      assert.strictEqual(res.body.message, 'Requires owner role or higher');
    }
    assert.strictEqual(await roleIn(workspaceA, people.owner), 'owner');
  });

  it('rejects a non-member, the caller themselves and a missing id', async () => {
    const path = `/api/workspaces/${workspaceA._id}/transfer-ownership`;
    assert.strictEqual((await as(people.owner).post(path).send({ newOwnerUserId: String(people.other.user._id) })).status, 404);
    assert.strictEqual((await as(people.owner).post(path).send({ newOwnerUserId: String(people.owner.user._id) })).status, 400);
    assert.strictEqual((await as(people.owner).post(path).send({})).status, 400);
  });

  it('an owner hands ownership to a member and is demoted to admin, not removed', async () => {
    // Use a throwaway workspace so the rest of this file keeps its owner.
    const giver = await makeUser('Giver');
    const receiver = await makeUser('Receiver');
    const ws = giver.workspace;
    await join(receiver, ws, 'creator', { activate: false });

    const res = await as(giver)
      .post(`/api/workspaces/${ws._id}/transfer-ownership`)
      .send({ newOwnerUserId: String(receiver.user._id) });
    assert.strictEqual(res.status, 200);

    assert.strictEqual(await roleIn(ws, receiver), 'owner');
    assert.strictEqual(await roleIn(ws, giver), 'admin');
    const stored = await Workspace.findById(ws._id).lean();
    assert.strictEqual(stored.members.length, 2);

    const audit = await AuditLog.findOne({ action: 'workspace.ownership.transfer', workspace: ws._id }).lean();
    assert.deepStrictEqual(audit.diff, { from: String(giver.user._id), to: String(receiver.user._id), previousOwnerRole: 'admin' });

    // The demoted caller can no longer transfer again.
    const again = await as(giver)
      .post(`/api/workspaces/${ws._id}/transfer-ownership`)
      .send({ newOwnerUserId: String(receiver.user._id) });
    assert.strictEqual(again.status, 403);
  });
});

describe('PATCH /api/links/:id/transfer', () => {
  it('is blocked when the caller is not a member of the destination workspace', async () => {
    const link = await linkIn(workspaceA, people.creator);
    const res = await as(people.creator).patch(`/api/links/${link._id}/transfer`).send({ workspaceId: String(workspaceB._id) });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(String((await Link.findById(link._id)).workspace), String(workspaceA._id));
  });

  it('is blocked when the caller is only a viewer in the destination, or a viewer in the source', async () => {
    const link = await linkIn(workspaceA, people.creator);
    await join(people.creator, workspaceB, 'viewer', { activate: false });
    const asViewerThere = await as(people.creator)
      .patch(`/api/links/${link._id}/transfer`)
      .send({ workspaceId: String(workspaceB._id) });
    assert.strictEqual(asViewerThere.status, 403);
    assert.match(asViewerThere.body.message, /creator role or higher in the destination/);

    const asViewerHere = await as(people.viewer)
      .patch(`/api/links/${link._id}/transfer`)
      .send({ workspaceId: String(workspaceB._id) });
    assert.strictEqual(asViewerHere.status, 403);
    await Workspace.updateOne({ _id: workspaceB._id }, { $pull: { members: { user: people.creator.user._id } } });
  });

  it('moves the link when the caller is creator+ in both, and audits both workspaces', async () => {
    const link = await linkIn(workspaceA, people.admin);
    await join(people.admin, workspaceB, 'creator', { activate: false });

    const res = await as(people.admin).patch(`/api/links/${link._id}/transfer`).send({ workspaceId: String(workspaceB._id) });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(String((await Link.findById(link._id)).workspace), String(workspaceB._id));

    // Gone from A's view, visible in B's.
    assert.strictEqual((await as(people.creator).get(`/api/links/${link._id}`)).status, 404);
    assert.strictEqual((await as(people.other).get(`/api/links/${link._id}`)).status, 200);

    assert.ok(await AuditLog.exists({ action: 'link.transfer.out', workspace: workspaceA._id, targetResourceId: String(link._id) }));
    assert.ok(await AuditLog.exists({ action: 'link.transfer.in', workspace: workspaceB._id, targetResourceId: String(link._id) }));
    await Workspace.updateOne({ _id: workspaceB._id }, { $pull: { members: { user: people.admin.user._id } } });
  });

  it("can't move a link that isn't in the caller's active workspace", async () => {
    const link = await linkIn(workspaceB, people.other);
    const res = await as(people.admin).patch(`/api/links/${link._id}/transfer`).send({ workspaceId: String(workspaceA._id) });
    assert.strictEqual(res.status, 404);
  });
});

describe('PATCH /:workspaceId/settings', () => {
  const path = () => `/api/workspaces/${workspaceA._id}/settings`;

  it('lets an admin set UTM and QR defaults, which then ride on the active-workspace payload', async () => {
    const res = await as(people.admin)
      .patch(path())
      .send({
        defaultUtmParams: { source: 'newsletter', medium: 'email' },
        defaultQrStyle: { dotsType: 'dots', dotsColor: '#112233', frame: { type: 'none', text: '', subtext: '', color: '#000000', textColor: '#ffffff' } },
      });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.settings.defaultUtmParams, { source: 'newsletter', medium: 'email' });

    const me = await as(people.viewer).get('/api/auth/me');
    assert.strictEqual(me.body.activeWorkspace.settings.defaultUtmParams.source, 'newsletter');
    assert.strictEqual(me.body.activeWorkspace.settings.defaultQrStyle.dotsType, 'dots');

    assert.ok(await AuditLog.exists({ action: 'workspace.settings.update', workspace: workspaceA._id }));
  });

  it('null clears a default; creators and viewers cannot change settings', async () => {
    const cleared = await as(people.admin).patch(path()).send({ defaultQrStyle: null });
    assert.strictEqual(cleared.status, 200);
    assert.strictEqual(cleared.body.settings.defaultQrStyle, null);
    assert.strictEqual(cleared.body.settings.defaultUtmParams.source, 'newsletter', 'untouched keys are kept');

    assert.strictEqual((await as(people.creator).patch(path()).send({ defaultUtmParams: null })).status, 403);
    assert.strictEqual((await as(people.viewer).patch(path()).send({ defaultUtmParams: null })).status, 403);
  });

  it('rejects unknown keys, bad QR values and domains that are not verified in this workspace', async () => {
    assert.strictEqual((await as(people.admin).patch(path()).send({ somethingElse: 1 })).status, 400);
    assert.strictEqual((await as(people.admin).patch(path()).send({ defaultQrStyle: { evil: 'x' } })).status, 400);
    assert.strictEqual((await as(people.admin).patch(path()).send({ defaultQrStyle: { dotsColor: 'red;}' } })).status, 400);
    assert.strictEqual(
      (await as(people.admin).patch(path()).send({ defaultQrStyle: { logo: 'javascript:alert(1)' } })).status,
      400
    );
    assert.strictEqual((await as(people.admin).patch(path()).send({})).status, 400);

    const suffix = crypto.randomBytes(4).toString('hex');
    const unverified = await CustomDomain.create({ user: people.owner.user._id, workspace: workspaceA._id, domain: `u${suffix}.example.com` });
    const elsewhere = await CustomDomain.create({
      user: people.other.user._id,
      workspace: workspaceB._id,
      domain: `b${suffix}.example.com`,
      isVerified: true,
    });
    const verified = await CustomDomain.create({
      user: people.owner.user._id,
      workspace: workspaceA._id,
      domain: `v${suffix}.example.com`,
      isVerified: true,
    });

    assert.strictEqual((await as(people.admin).patch(path()).send({ defaultDomain: String(unverified._id) })).status, 400);
    assert.strictEqual((await as(people.admin).patch(path()).send({ defaultDomain: String(elsewhere._id) })).status, 400);
    const ok = await as(people.admin).patch(path()).send({ defaultDomain: String(verified._id) });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(String(ok.body.settings.defaultDomain), String(verified._id));
  });
});

describe('GET /:workspaceId/activity and audit entries', () => {
  it('lists this workspace’s audit entries newest first, admin+ only, without actor IPs', async () => {
    const created = await as(people.creator).post('/api/links').send({ originalUrl: 'https://example.com/activity' });
    assert.strictEqual(created.status, 201);
    // Audit writes are fire-and-forget; give this one a moment to land.
    for (let i = 0; i < 20 && !(await AuditLog.exists({ targetResourceId: String(created.body.link._id) })); i += 1) {
      await new Promise((r) => setTimeout(r, 25));
    }

    const res = await as(people.admin).get(`/api/workspaces/${workspaceA._id}/activity?limit=5`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.activity.length <= 5);
    assert.ok(res.body.pagination.total >= res.body.activity.length);
    const entry = res.body.activity.find((e) => e.targetResourceId === String(created.body.link._id));
    assert.ok(entry, 'the link.create entry is listed');
    assert.strictEqual(entry.action, 'link.create');
    assert.strictEqual(entry.actor.name, 'WA Creator');
    assert.strictEqual(entry.ipAddress, undefined);

    const times = res.body.activity.map((e) => new Date(e.timestamp).getTime());
    assert.deepStrictEqual(times, [...times].sort((a, b) => b - a));

    // Nothing from workspace B leaks in.
    const all = await as(people.admin).get(`/api/workspaces/${workspaceA._id}/activity?limit=100`);
    const ids = all.body.activity.map((e) => e.id);
    const foreign = await AuditLog.find({ _id: { $in: ids }, workspace: { $ne: workspaceA._id } }).lean();
    assert.deepStrictEqual(foreign, []);

    assert.strictEqual((await as(people.creator).get(`/api/workspaces/${workspaceA._id}/activity`)).status, 403);
    assert.strictEqual((await as(people.viewer).get(`/api/workspaces/${workspaceA._id}/activity`)).status, 403);
  });

  it('webhook audit entries keep only the URL origin, and link updates record field names not values', async () => {
    const hook = await as(people.admin)
      .post('/api/webhooks')
      .send({ url: 'https://example.com/services/T000/B000/SECRETTOKEN', events: ['link.created'] });
    assert.strictEqual(hook.status, 201);

    const link = await linkIn(workspaceA, people.creator);
    const updated = await as(people.creator).put(`/api/links/${link._id}`).send({ title: 't', password: 'hunter2hunter2' });
    assert.strictEqual(updated.status, 200);

    await new Promise((r) => setTimeout(r, 100));
    const hookAudit = await AuditLog.findOne({ action: 'webhook.create', targetResourceId: String(hook.body.webhook._id) }).lean();
    assert.strictEqual(hookAudit.diff.url, 'https://example.com');
    assert.strictEqual(String(hookAudit.workspace), String(workspaceA._id));

    const linkAudit = await AuditLog.findOne({ action: 'link.update', targetResourceId: String(link._id) }).lean();
    assert.deepStrictEqual([...linkAudit.diff.changedFields].sort(), ['password', 'title']);
    assert.ok(!JSON.stringify(linkAudit).includes('$2'), 'no password hash in the audit log');
  });
});
