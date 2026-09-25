import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import http from 'http';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import Link from '../../src/models/Link.js';
import ApiKey from '../../src/models/ApiKey.js';
import ApiLog from '../../src/models/ApiLog.js';
import Webhook from '../../src/models/Webhook.js';
import WebhookDelivery from '../../src/models/WebhookDelivery.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { dispatchLinkEvent } from '../../src/services/webhookService.js';

// Workspace A: owner creates everything; admin, creator and viewer are
// teammates with those roles and A as their active workspace. The outsider
// is a legitimate user whose only workspace is their own (B).
let owner;
let admin;
let creator;
let viewer;
let outsider;
let workspaceA;
let workspaceB;

const createdUsers = [];
let seq = 0;
let receiver;
let receiverPort;

async function makeUser(name) {
  const created = await createTestUser({ name });
  createdUsers.push(created.user);
  return created;
}

async function joinWorkspace(member, workspace, role) {
  await Workspace.updateOne({ _id: workspace._id }, { $push: { members: { user: member.user._id, role } } });
  await User.updateOne({ _id: member.user._id }, { $set: { activeWorkspace: workspace._id } });
}

function linkFixture(creatorUser, workspace, overrides = {}) {
  seq += 1;
  const shortCode = `wsc${Date.now().toString(36)}${seq}`;
  return Link.create({
    originalUrl: `https://example.com/${shortCode}`,
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
    user: creatorUser._id,
    workspace: workspace._id,
    ...overrides,
  });
}

async function apiKeyFixture(creatorUser, workspace) {
  const raw = `lnk_test_${crypto.randomBytes(24).toString('hex')}`;
  const doc = await ApiKey.create({
    user: creatorUser._id,
    workspace: workspace._id,
    name: 'scoping test key',
    keyHash: crypto.createHash('sha256').update(raw).digest('hex'),
    prefix: raw.slice(0, 12),
    maskedKey: `${raw.slice(0, 12)}...${raw.slice(-4)}`,
    lastFour: raw.slice(-4),
  });
  return { raw, doc };
}

function webhookFixture(creatorUser, workspace, overrides = {}) {
  return Webhook.create({
    user: creatorUser._id,
    workspace: workspace._id,
    url: 'https://example.com/hook',
    events: ['link.created'],
    secret: 'whsec_test',
    ...overrides,
  });
}

// Deliveries are fire-and-forget, so poll for the delivery record.
async function waitForDeliveries(webhookId, count, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const deliveries = await WebhookDelivery.find({ webhook: webhookId }).lean();
    if (deliveries.length >= count || Date.now() > deadline) return deliveries;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

beforeAll(async () => {
  await connectTestDb();
  receiver = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"received":true}');
    });
  });
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  receiverPort = receiver.address().port;

  owner = await makeUser('Owner A');
  admin = await makeUser('Admin A');
  creator = await makeUser('Creator A');
  viewer = await makeUser('Viewer A');
  outsider = await makeUser('Outsider B');
  workspaceA = owner.workspace;
  workspaceB = outsider.workspace;

  await joinWorkspace(admin, workspaceA, 'admin');
  await joinWorkspace(creator, workspaceA, 'creator');
  await joinWorkspace(viewer, workspaceA, 'viewer');
});

afterAll(async () => {
  const userIds = createdUsers.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  const workspaceIds = await Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
  const webhookIds = await Webhook.find({ workspace: { $in: workspaceIds } }).distinct('_id');
  await WebhookDelivery.deleteMany({ webhook: { $in: webhookIds } });
  for (const Model of [Link, ApiKey, ApiLog, Webhook]) await Model.deleteMany({ workspace: { $in: workspaceIds } });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await new Promise((resolve) => receiver.close(resolve));
  await disconnectTestDb();
  await closeRedis();
});

describe('links are owned by the workspace, not the creating user', () => {
  it("a teammate sees and manages a link another member created; an outsider gets 404", async () => {
    const link = await linkFixture(owner.user, workspaceA, { title: 'before' });

    const list = await request(app).get('/api/links?limit=100').set(authHeader(creator.token));
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.links.some((l) => String(l._id) === String(link._id)));

    const get = await request(app).get(`/api/links/${link._id}`).set(authHeader(creator.token));
    assert.strictEqual(get.status, 200);

    const update = await request(app).put(`/api/links/${link._id}`).set(authHeader(creator.token)).send({ title: 'after' });
    assert.strictEqual(update.status, 200);
    assert.strictEqual(update.body.link.title, 'after');

    const toggle = await request(app).patch(`/api/links/${link._id}/toggle`).set(authHeader(creator.token));
    assert.strictEqual(toggle.status, 200);

    for (const [method, path] of [
      ['get', `/api/links/${link._id}`],
      ['put', `/api/links/${link._id}`],
      ['patch', `/api/links/${link._id}/toggle`],
      ['delete', `/api/links/${link._id}`],
    ]) {
      const res = await request(app)[method](path).set(authHeader(outsider.token)).send({ title: 'hijack' });
      assert.strictEqual(res.status, 404, `${method.toUpperCase()} ${path} as outsider`);
    }
    const outsiderList = await request(app).get('/api/links?limit=100').set(authHeader(outsider.token));
    assert.ok(!outsiderList.body.links.some((l) => String(l._id) === String(link._id)));

    const del = await request(app).delete(`/api/links/${link._id}`).set(authHeader(creator.token));
    assert.strictEqual(del.status, 200);
    assert.strictEqual(await Link.exists({ _id: link._id }), null);
  });

  it('stamps both the creating user and the active workspace on create', async () => {
    const res = await request(app)
      .post('/api/links')
      .set(authHeader(creator.token))
      .send({ originalUrl: 'https://example.com/created-by-creator' });
    assert.strictEqual(res.status, 201);

    const stored = await Link.findById(res.body.link._id).lean();
    assert.strictEqual(String(stored.user), String(creator.user._id));
    assert.strictEqual(String(stored.workspace), String(workspaceA._id));
  });

  it("exposes only the creator's public profile fields to teammates", async () => {
    await User.updateOne({ _id: owner.user._id }, { $set: { apiKey: 'lnk_legacy_secret' } });
    const link = await linkFixture(owner.user, workspaceA);

    const res = await request(app).get(`/api/links/${link._id}`).set(authHeader(viewer.token));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.link.user.name, 'Owner A');
    assert.strictEqual(res.body.link.user.apiKey, undefined);
    assert.strictEqual(res.body.link.user.links, undefined);
  });

  it('a viewer can read but not create, edit or delete', async () => {
    const link = await linkFixture(owner.user, workspaceA);

    assert.strictEqual((await request(app).get(`/api/links/${link._id}`).set(authHeader(viewer.token))).status, 200);
    assert.strictEqual(
      (await request(app).post('/api/links').set(authHeader(viewer.token)).send({ originalUrl: 'https://example.com/v' })).status,
      403
    );
    assert.strictEqual(
      (await request(app).put(`/api/links/${link._id}`).set(authHeader(viewer.token)).send({ title: 'x' })).status,
      403
    );
    assert.strictEqual((await request(app).delete(`/api/links/${link._id}`).set(authHeader(viewer.token))).status, 403);
  });
});

describe('analytics follow workspace membership', () => {
  it("a teammate can read another member's link analytics; an outsider gets 404", async () => {
    const link = await linkFixture(owner.user, workspaceA);

    const teammate = await request(app).get(`/api/analytics/link/${link._id}`).set(authHeader(viewer.token));
    assert.strictEqual(teammate.status, 200);

    const stranger = await request(app).get(`/api/analytics/link/${link._id}`).set(authHeader(outsider.token));
    assert.strictEqual(stranger.status, 404);

    const exportRes = await request(app)
      .get(`/api/analytics/export?linkId=${link._id}`)
      .set(authHeader(outsider.token));
    assert.strictEqual(exportRes.status, 404);
  });

  it("the summary counts every link in the workspace, whoever created it", async () => {
    const expected = await Link.countDocuments({ workspace: workspaceA._id });
    const res = await request(app).get('/api/analytics/summary/all').set(authHeader(viewer.token));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.summary.totalLinks, expected);
    assert.ok(expected > 0);
  });
});

describe('API keys belong to the workspace', () => {
  it("an admin teammate manages a key another member created; an outsider gets 404; a creator gets 403", async () => {
    const { doc } = await apiKeyFixture(owner.user, workspaceA);

    const list = await request(app).get('/api/developer/keys').set(authHeader(admin.token));
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.keys.some((k) => String(k._id) === String(doc._id)));

    assert.strictEqual((await request(app).get('/api/developer/keys').set(authHeader(creator.token))).status, 403);

    const outsiderPatch = await request(app)
      .patch(`/api/developer/keys/${doc._id}`)
      .set(authHeader(outsider.token))
      .send({ name: 'hijack' });
    assert.strictEqual(outsiderPatch.status, 404);
    const outsiderRevoke = await request(app).delete(`/api/developer/keys/${doc._id}`).set(authHeader(outsider.token));
    assert.strictEqual(outsiderRevoke.status, 404);

    const revoke = await request(app).delete(`/api/developer/keys/${doc._id}`).set(authHeader(admin.token));
    assert.strictEqual(revoke.status, 200);
  });

  it('a new key is stamped with the active workspace', async () => {
    const res = await request(app).post('/api/developer/keys').set(authHeader(admin.token)).send({ name: 'admin key' });
    assert.strictEqual(res.status, 201);
    const stored = await ApiKey.findById(res.body.key._id).lean();
    assert.strictEqual(String(stored.workspace), String(workspaceA._id));
    assert.strictEqual(String(stored.user), String(admin.user._id));
  });
});

describe('webhooks belong to the workspace', () => {
  it("an admin teammate manages another member's webhook; an outsider gets 404", async () => {
    const hook = await webhookFixture(owner.user, workspaceA);
    const delivery = await WebhookDelivery.create({
      webhook: hook._id,
      user: owner.user._id,
      event: 'link.created',
      url: hook.url,
      status: 'failed',
    });

    const get = await request(app).get(`/api/webhooks/${hook._id}`).set(authHeader(admin.token));
    assert.strictEqual(get.status, 200);

    assert.strictEqual((await request(app).get(`/api/webhooks/${hook._id}`).set(authHeader(outsider.token))).status, 404);
    assert.strictEqual(
      (await request(app).post(`/api/webhooks/${hook._id}/rotate-secret`).set(authHeader(outsider.token))).status,
      404
    );
    // Retry via the outsider's own webhook id must not reach A's delivery either.
    const outsiderHook = await webhookFixture(outsider.user, workspaceB);
    const crossRetry = await request(app)
      .post(`/api/webhooks/${outsiderHook._id}/deliveries/${delivery._id}/retry`)
      .set(authHeader(outsider.token));
    assert.strictEqual(crossRetry.status, 404);

    assert.strictEqual((await request(app).get(`/api/webhooks/${hook._id}`).set(authHeader(viewer.token))).status, 403);

    const del = await request(app).delete(`/api/webhooks/${hook._id}`).set(authHeader(admin.token));
    assert.strictEqual(del.status, 200);
  });
});

describe('public API keys act in their own workspace', () => {
  it("sees a teammate's link through workspace A's key, and not through workspace B's", async () => {
    const link = await linkFixture(creator.user, workspaceA);
    const { raw: keyA } = await apiKeyFixture(owner.user, workspaceA);
    const { raw: keyB } = await apiKeyFixture(outsider.user, workspaceB);

    const viaA = await request(app).get(`/api/public/v1/links/${link.shortCode}`).set('x-api-key', keyA);
    assert.strictEqual(viaA.status, 200);

    const viaB = await request(app).get(`/api/public/v1/links/${link.shortCode}`).set('x-api-key', keyB);
    assert.strictEqual(viaB.status, 404);

    const listB = await request(app).get('/api/public/v1/links?limit=100').set('x-api-key', keyB);
    assert.ok(!listB.body.links.some((l) => String(l.id) === String(link._id)));
  });

  it("stops working once its creator leaves the workspace, and can't write after they're demoted", async () => {
    const leaver = await makeUser('Leaver A');
    await joinWorkspace(leaver, workspaceA, 'creator');
    const { raw } = await apiKeyFixture(leaver.user, workspaceA);

    await Workspace.updateOne({ _id: workspaceA._id, 'members.user': leaver.user._id }, { $set: { 'members.$.role': 'viewer' } });
    const demotedWrite = await request(app)
      .post('/api/public/v1/links')
      .set('x-api-key', raw)
      .send({ originalUrl: 'https://example.com/demoted' });
    assert.strictEqual(demotedWrite.status, 403);
    assert.strictEqual((await request(app).get('/api/public/v1/links').set('x-api-key', raw)).status, 200);

    await Workspace.updateOne({ _id: workspaceA._id }, { $pull: { members: { user: leaver.user._id } } });
    assert.strictEqual((await request(app).get('/api/public/v1/links').set('x-api-key', raw)).status, 401);
  });
});

describe('active workspace resolution', () => {
  it('a member removed from their active workspace falls back and loses access to it', async () => {
    const leaver = await makeUser('Removed A');
    await joinWorkspace(leaver, workspaceA, 'creator');
    const link = await linkFixture(owner.user, workspaceA);

    assert.strictEqual((await request(app).get(`/api/links/${link._id}`).set(authHeader(leaver.token))).status, 200);

    await Workspace.updateOne({ _id: workspaceA._id }, { $pull: { members: { user: leaver.user._id } } });

    assert.strictEqual((await request(app).get(`/api/links/${link._id}`).set(authHeader(leaver.token))).status, 404);
    const reloaded = await User.findById(leaver.user._id);
    assert.strictEqual(String(reloaded.activeWorkspace), String(leaver.workspace._id));
  });

  it('a user with no workspace yet gets a personal one on first request', async () => {
    const { user, token } = await createTestUser({ name: 'Fresh' }, { withWorkspace: false });
    createdUsers.push(user);

    const res = await request(app).get('/api/links').set(authHeader(token));
    assert.strictEqual(res.status, 200);

    const reloaded = await User.findById(user._id);
    const workspace = await Workspace.findById(reloaded.activeWorkspace);
    assert.deepStrictEqual(
      workspace.members.map((m) => ({ user: String(m.user), role: m.role })),
      [{ user: String(user._id), role: 'owner' }]
    );
  });
});

describe('webhook events are routed by workspace', () => {
  it("a teammate's link event reaches the workspace's webhooks and no other workspace's", async () => {
    const url = `http://127.0.0.1:${receiverPort}/hook`;
    const hookA = await webhookFixture(owner.user, workspaceA, { url, events: ['link.created', 'link.updated'] });
    const hookB = await webhookFixture(outsider.user, workspaceB, { url, events: ['link.created', 'link.updated'] });

    const res = await request(app)
      .post('/api/links')
      .set(authHeader(creator.token))
      .send({ originalUrl: 'https://example.com/webhook-routing' });
    assert.strictEqual(res.status, 201);

    const deliveriesA = await waitForDeliveries(hookA._id, 1);
    assert.deepStrictEqual(deliveriesA.map((d) => d.event), ['link.created']);
    assert.strictEqual(deliveriesA[0].status, 'success');

    // No workspaceId given (a stale link:meta hash or stream entry): the
    // link's own workspace is looked up instead.
    await dispatchLinkEvent({ linkId: res.body.link._id }, 'link.updated', { linkId: res.body.link._id });
    const afterFallback = await waitForDeliveries(hookA._id, 2);
    assert.deepStrictEqual(afterFallback.map((d) => d.event).sort(), ['link.created', 'link.updated']);

    assert.strictEqual(await WebhookDelivery.countDocuments({ webhook: hookB._id }), 0);
  });
});
