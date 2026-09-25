import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader, resetRateLimits } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import AuditLog from '../../src/models/AuditLog.js';
import { hashInviteToken } from '../../src/services/inviteService.js';
import { redactUrlSecrets } from '../../src/config/logger.js';
import { closeRedis } from '../../src/services/cacheService.js';

let owner;
let admin;
let viewer;
let workspace;
const createdUsers = [];

async function makeUser(overrides = {}) {
  const created = await createTestUser(overrides);
  createdUsers.push(created.user);
  return created;
}

function uniqueEmail(label) {
  return `invite-${label}-${crypto.randomBytes(4).toString('hex')}@example.com`;
}

function tokenFromUrl(url) {
  return url.split('/invite/')[1];
}

function invite(actor, email, role = 'creator') {
  return request(app)
    .post(`/api/workspaces/${workspace._id}/invites`)
    .set(authHeader(actor.token))
    .send({ email, role });
}

function accept(actor, token) {
  return request(app).post(`/api/workspaces/invites/${token}/accept`).set(authHeader(actor.token));
}

async function memberRole(userId) {
  const ws = await Workspace.findById(workspace._id).lean();
  return ws.members.find((m) => String(m.user) === String(userId))?.role;
}

beforeAll(async () => {
  await connectTestDb();
  await resetRateLimits(['invite']);
  owner = await makeUser({ name: 'Invite Owner' });
  admin = await makeUser({ name: 'Invite Admin' });
  viewer = await makeUser({ name: 'Invite Viewer' });
  workspace = owner.workspace;
  await Workspace.updateOne(
    { _id: workspace._id },
    { $push: { members: { $each: [{ user: admin.user._id, role: 'admin' }, { user: viewer.user._id, role: 'viewer' }] } } }
  );
});

afterAll(async () => {
  const userIds = createdUsers.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  await Workspace.deleteMany({ organization: { $in: orgIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('creating invites', () => {
  it('an email with no account gets a pending invite and a link; only the token hash is stored', async () => {
    const email = uniqueEmail('new');
    const res = await invite(admin, email, 'creator');

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.invite.email, email);
    assert.strictEqual(res.body.invite.role, 'creator');
    assert.strictEqual(res.body.emailSent, false);
    assert.match(res.body.inviteUrl, /\/invite\/[0-9a-f]{64}$/);
    assert.strictEqual(res.body.invite.tokenHash, undefined);

    const token = tokenFromUrl(res.body.inviteUrl);
    const stored = await Workspace.findById(workspace._id).lean();
    const entry = stored.pendingInvites.find((i) => i.email === email);
    assert.strictEqual(entry.tokenHash, hashInviteToken(token));
    assert.ok(!JSON.stringify(stored).includes(token), 'raw token must never be stored');
    assert.ok(entry.expiresAt.getTime() > Date.now() + 6 * 24 * 60 * 60 * 1000);

    const audit = await AuditLog.findOne({ action: 'workspace.invite.create', targetResourceId: String(workspace._id) })
      .sort({ _id: -1 })
      .lean();
    assert.strictEqual(audit.diff.email, email);
  });

  it('an existing user also gets a pending invite (not added directly), with an identical response shape', async () => {
    const existing = await makeUser({ name: 'Existing', email: uniqueEmail('existing') });
    const res = await invite(admin, existing.user.email, 'viewer');

    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(Object.keys(res.body).sort(), ['emailSent', 'invite', 'inviteUrl', 'resent', 'success']);
    assert.strictEqual(await memberRole(existing.user._id), undefined, 'not a member until they accept');
  });

  it('re-inviting the same email is a resend: one entry, new token, old link dead', async () => {
    const email = uniqueEmail('resend');
    const first = await invite(admin, email, 'viewer');
    const second = await invite(admin, email, 'creator');

    assert.strictEqual(second.status, 201);
    assert.strictEqual(second.body.resent, true);
    assert.strictEqual(second.body.invite.role, 'creator');
    const stored = await Workspace.findById(workspace._id).lean();
    assert.strictEqual(stored.pendingInvites.filter((i) => i.email === email).length, 1);

    const oldLookup = await request(app).get(`/api/workspaces/invites/${tokenFromUrl(first.body.inviteUrl)}`);
    assert.strictEqual(oldLookup.status, 404);
    const newLookup = await request(app).get(`/api/workspaces/invites/${tokenFromUrl(second.body.inviteUrl)}`);
    assert.strictEqual(newLookup.status, 200);
  });

  it('rejects bad input, non-admins, owner invites from an admin, and existing members', async () => {
    assert.strictEqual((await invite(admin, 'not-an-email')).status, 400);
    assert.strictEqual((await invite(admin, uniqueEmail('role'), 'superuser')).status, 400);
    assert.strictEqual((await invite(viewer, uniqueEmail('viewer'))).status, 403);
    assert.strictEqual((await invite(admin, uniqueEmail('owner'), 'owner')).status, 403);
    assert.strictEqual((await invite(owner, uniqueEmail('owner'), 'owner')).status, 201);
    assert.strictEqual((await invite(admin, viewer.user.email)).status, 409);
  });
});

describe('looking up and accepting invites', () => {
  it('the public lookup describes the invite; unknown tokens 404', async () => {
    const email = uniqueEmail('lookup');
    const created = await invite(admin, email, 'creator');

    const res = await request(app).get(`/api/workspaces/invites/${tokenFromUrl(created.body.inviteUrl)}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.invite.workspace.name, workspace.name);
    assert.ok(res.body.invite.organization.name);
    assert.strictEqual(res.body.invite.role, 'creator');
    assert.strictEqual(res.body.invite.email, email);

    const unknown = await request(app).get(`/api/workspaces/invites/${'0'.repeat(64)}`);
    assert.strictEqual(unknown.status, 404);
  });

  it('accepting a valid invite joins with the invited role, consumes it, and makes it the active workspace', async () => {
    const email = uniqueEmail('accept');
    const created = await invite(admin, email, 'creator');
    const token = tokenFromUrl(created.body.inviteUrl);
    // The invitee signs up after being invited.
    const invitee = await makeUser({ name: 'Invitee', email });

    const res = await accept(invitee, token);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.activeWorkspace, { id: String(workspace._id), name: workspace.name, role: 'creator' });

    assert.strictEqual(await memberRole(invitee.user._id), 'creator');
    const reloaded = await User.findById(invitee.user._id);
    assert.strictEqual(String(reloaded.activeWorkspace), String(workspace._id));
    const stored = await Workspace.findById(workspace._id).lean();
    assert.ok(!stored.pendingInvites.some((i) => i.email === email));

    // Single use.
    assert.strictEqual((await accept(invitee, token)).status, 404);
    assert.ok(await AuditLog.exists({ action: 'workspace.invite.accept', actorUserId: invitee.user._id }));
  });

  it("can't be accepted by a different account, and the invite survives the attempt", async () => {
    const email = uniqueEmail('intended');
    const created = await invite(admin, email, 'admin');
    const token = tokenFromUrl(created.body.inviteUrl);
    const stranger = await makeUser({ name: 'Stranger', email: uniqueEmail('stranger') });

    const res = await accept(stranger, token);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(await memberRole(stranger.user._id), undefined);
    assert.strictEqual((await request(app).get(`/api/workspaces/invites/${token}`)).status, 200);
  });

  it('an expired invite can be neither looked up nor accepted', async () => {
    const email = uniqueEmail('expired');
    const created = await invite(admin, email, 'creator');
    const token = tokenFromUrl(created.body.inviteUrl);
    await Workspace.updateOne(
      { _id: workspace._id, 'pendingInvites.email': email },
      { $set: { 'pendingInvites.$.expiresAt': new Date(Date.now() - 1000) } }
    );
    const invitee = await makeUser({ name: 'Late', email });

    assert.strictEqual((await request(app).get(`/api/workspaces/invites/${token}`)).status, 410);
    assert.strictEqual((await accept(invitee, token)).status, 410);
    assert.strictEqual(await memberRole(invitee.user._id), undefined);
  });

  it('accepting requires a session', async () => {
    const created = await invite(admin, uniqueEmail('anon'), 'viewer');
    const res = await request(app).post(`/api/workspaces/invites/${tokenFromUrl(created.body.inviteUrl)}/accept`);
    assert.strictEqual(res.status, 401);
  });
});

describe('revoking invites and exposure', () => {
  it('an admin revokes a pending invite, after which its link is dead; viewers cannot revoke', async () => {
    const email = uniqueEmail('revoke');
    const created = await invite(admin, email, 'viewer');
    const token = tokenFromUrl(created.body.inviteUrl);
    const inviteId = created.body.invite.id;

    const byViewer = await request(app)
      .delete(`/api/workspaces/${workspace._id}/invites/${inviteId}`)
      .set(authHeader(viewer.token));
    assert.strictEqual(byViewer.status, 403);

    const res = await request(app)
      .delete(`/api/workspaces/${workspace._id}/invites/${inviteId}`)
      .set(authHeader(admin.token));
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await request(app).get(`/api/workspaces/invites/${token}`)).status, 404);
    assert.ok(await AuditLog.exists({ action: 'workspace.invite.revoke', 'diff.inviteId': inviteId }));

    const again = await request(app)
      .delete(`/api/workspaces/${workspace._id}/invites/${inviteId}`)
      .set(authHeader(admin.token));
    assert.strictEqual(again.status, 404);
  });

  it('pending invites are listed for admins (without token hashes) and hidden from viewers and the workspace list', async () => {
    const email = uniqueEmail('listed');
    await invite(admin, email, 'viewer');

    const asAdmin = await request(app).get(`/api/workspaces/${workspace._id}`).set(authHeader(admin.token));
    const listed = asAdmin.body.workspace.pendingInvites.find((i) => i.email === email);
    assert.ok(listed);
    assert.strictEqual(listed.tokenHash, undefined);

    const asViewer = await request(app).get(`/api/workspaces/${workspace._id}`).set(authHeader(viewer.token));
    assert.deepStrictEqual(asViewer.body.workspace.pendingInvites, []);

    const list = await request(app).get('/api/workspaces').set(authHeader(viewer.token));
    const mine = list.body.workspaces.find((w) => String(w._id) === String(workspace._id));
    assert.strictEqual(mine.pendingInvites, undefined);
  });

  it('request logs never carry invite or unlock tokens', () => {
    const token = 'a'.repeat(64);
    assert.strictEqual(
      redactUrlSecrets(`POST /api/workspaces/invites/${token}/accept 200`),
      'POST /api/workspaces/invites/[REDACTED]/accept 200'
    );
    assert.strictEqual(redactUrlSecrets(`https://app.example/invite/${token}`), 'https://app.example/invite/[REDACTED]');
    assert.strictEqual(redactUrlSecrets('/api/r/abc?unlockToken=x.y.z&probe=1'), '/api/r/abc?unlockToken=[REDACTED]&probe=1');
  });
});
