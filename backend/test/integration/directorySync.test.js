import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import ApiKey from '../../src/models/ApiKey.js';
import AuditLog from '../../src/models/AuditLog.js';
import CustomRole from '../../src/models/CustomRole.js';
import DirectoryUser from '../../src/models/DirectoryUser.js';
import { issueRefreshToken, consumeRefreshToken } from '../../src/utils/jwt.js';
import { closeRedis } from '../../src/services/cacheService.js';

const SECRET = 'whsec_test_directory_secret';
const created = [];
let originalSecret;

const hex = () => crypto.randomBytes(6).toString('hex');
const directoryId = () => `directory_${hex()}${hex()}`;

async function makeUser(name, overrides = {}) {
  const user = await createTestUser({ name, ...overrides });
  created.push(user.user);
  return user;
}

/** An org with an admin, and directory sync enabled for a fresh directory id. */
async function makeOrg({ defaultRole = 'creator' } = {}) {
  const owner = await makeUser('Dir Owner');
  const admin = await makeUser('Dir Admin');
  await Workspace.updateOne({ _id: owner.workspace._id }, { $push: { members: { user: admin.user._id, role: 'admin' } } });
  const dir = directoryId();
  await Organization.updateOne(
    { _id: owner.workspace.organization },
    { $set: { directorySync: { enabled: true, directoryId: dir, defaultRole } } }
  );
  return { owner, admin, workspace: owner.workspace, orgId: owner.workspace.organization, dir };
}

function sign(body, { secret = SECRET, t = Date.now() } = {}) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t}, v1=${v1}`;
}

function deliver(event, options = {}) {
  const body = options.body ?? JSON.stringify(event);
  return request(app)
    .post('/api/auth/sso/scim/events')
    .set('Content-Type', 'application/json')
    .set('WorkOS-Signature', options.signature ?? sign(body, options))
    .send(body);
}

function userEvent(type, dir, directoryUser, { createdAt = new Date(), ...data } = {}) {
  return {
    id: `event_${hex()}`,
    event: type,
    created_at: createdAt.toISOString(),
    data: {
      id: directoryUser.id,
      directory_id: dir,
      organization_id: 'org_workos_test',
      email: directoryUser.email,
      first_name: directoryUser.first ?? 'Dana',
      last_name: directoryUser.last ?? 'Directory',
      state: 'active',
      ...data,
    },
  };
}

const newDirectoryUser = () => ({ id: `directory_user_${hex()}`, email: `scim-${hex()}@example.com` });
const memberOf = async (workspace, userId) =>
  (await Workspace.findById(workspace._id).lean()).members.find((m) => String(m.user) === String(userId));

beforeAll(async () => {
  await connectTestDb();
  originalSecret = env.WORKOS_WEBHOOK_SECRET;
});

beforeEach(() => {
  env.WORKOS_WEBHOOK_SECRET = SECRET;
});

afterAll(async () => {
  env.WORKOS_WEBHOOK_SECRET = originalSecret;
  const scimUsers = await User.find({ email: /^scim-.*@example\.com$/ }).distinct('_id');
  const userIds = [...created.map((u) => u._id), ...scimUsers];
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  const workspaceIds = await Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
  await DirectoryUser.deleteMany({ organization: { $in: orgIds } });
  await CustomRole.deleteMany({ organization: { $in: orgIds } });
  await ApiKey.deleteMany({ workspace: { $in: workspaceIds } });
  await AuditLog.deleteMany({ workspace: { $in: workspaceIds } });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('webhook authentication', () => {
  it('rejects missing, wrongly signed, stale and tampered deliveries', async () => {
    const { dir } = await makeOrg();
    const event = userEvent('dsync.user.created', dir, newDirectoryUser());
    const body = JSON.stringify(event);

    assert.strictEqual((await deliver(event, { signature: '' })).status, 401);
    assert.strictEqual((await deliver(event, { secret: 'wrong-secret' })).status, 401);
    assert.strictEqual((await deliver(event, { t: Date.now() - 10 * 60 * 1000 })).status, 401, 'outside the replay window');
    const tampered = body.replace('Dana', 'Mallory');
    assert.strictEqual((await deliver(event, { body: tampered, signature: sign(body) })).status, 401);
    assert.strictEqual(await User.exists({ email: event.data.email }), null);
  });

  it('is unavailable when the deployment has no webhook secret', async () => {
    env.WORKOS_WEBHOOK_SECRET = '';
    const res = await deliver({ event: 'dsync.user.created', data: {} }, { secret: 'anything' });
    assert.strictEqual(res.status, 501);
  });

  it('acknowledges but ignores events for directories no org has enabled', async () => {
    const who = newDirectoryUser();
    const res = await deliver(userEvent('dsync.user.created', directoryId(), who));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.outcome, 'ignored:directory_not_enabled');
    assert.strictEqual(await User.exists({ email: who.email }), null);
  });
});

describe('dsync.user.created / updated', () => {
  it('provisions a new user into the org’s workspace with the default role, managed by SCIM', async () => {
    const { workspace, orgId, dir } = await makeOrg();
    const who = newDirectoryUser();

    const res = await deliver(userEvent('dsync.user.created', dir, who));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.outcome, 'provisioned');

    const user = await User.findOne({ email: who.email });
    assert.strictEqual(user.provisionedBy, 'scim');
    assert.strictEqual(user.name, 'Dana Directory');
    assert.strictEqual(String(user.activeWorkspace), String(workspace._id));
    assert.deepStrictEqual(
      { role: (await memberOf(workspace, user._id)).role, managedBy: (await memberOf(workspace, user._id)).managedBy },
      { role: 'creator', managedBy: 'scim' }
    );
    assert.strictEqual((await DirectoryUser.findOne({ organization: orgId, directoryUserId: who.id })).state, 'provisioned');
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(await AuditLog.exists({ action: 'directory.user.provision', workspace: workspace._id }));

    // Redelivery (WorkOS retries) changes nothing.
    await deliver(userEvent('dsync.user.created', dir, who));
    assert.strictEqual(await User.countDocuments({ email: who.email }), 1);
    const members = (await Workspace.findById(workspace._id).lean()).members.filter((m) => String(m.user) === String(user._id));
    assert.strictEqual(members.length, 1);
  });

  it('uses a custom default role when one is configured, and follows name updates', async () => {
    const { workspace, orgId, dir } = await makeOrg();
    const role = await CustomRole.create({ organization: orgId, name: `Directory ${hex()}`, permissions: ['links:read'] });
    await Organization.updateOne({ _id: orgId }, { $set: { 'directorySync.defaultRole': String(role._id) } });
    const who = newDirectoryUser();

    await deliver(userEvent('dsync.user.created', dir, who));
    const user = await User.findOne({ email: who.email });
    assert.strictEqual((await memberOf(workspace, user._id)).role, String(role._id));

    await deliver(userEvent('dsync.user.updated', dir, { ...who, first: 'Renamed' }, { createdAt: new Date(Date.now() + 1000) }));
    assert.strictEqual((await User.findById(user._id)).name, 'Renamed Directory');
  });

  it('invites (rather than adds) an email that already has a Linkora account', async () => {
    const { workspace, orgId, dir } = await makeOrg();
    const existing = await makeUser('Already here', { email: `scim-existing-${hex()}@example.com` });
    const res = await deliver(userEvent('dsync.user.created', dir, { id: `directory_user_${hex()}`, email: existing.user.email }));

    assert.strictEqual(res.body.outcome, 'invited');
    assert.strictEqual(await memberOf(workspace, existing.user._id), undefined, 'not added without consent');
    const stored = await Workspace.findById(workspace._id).lean();
    assert.ok(stored.pendingInvites.some((i) => i.email === existing.user.email && i.role === 'creator'));
    assert.strictEqual((await DirectoryUser.findOne({ organization: orgId, email: existing.user.email })).state, 'invited');
    assert.strictEqual((await User.findById(existing.user._id)).provisionedBy, null);
  });
});

describe('dsync.user.deleted', () => {
  it('deactivates the user in this org only: membership, sessions and API keys; the account stays', async () => {
    const { workspace, orgId, dir } = await makeOrg();
    const who = newDirectoryUser();
    await deliver(userEvent('dsync.user.created', dir, who, { createdAt: new Date(Date.now() - 5000) }));
    const user = await User.findOne({ email: who.email });

    // They also belong to another org, and have a session and an API key here.
    const otherOrg = await makeOrg();
    await Workspace.updateOne({ _id: otherOrg.workspace._id }, { $push: { members: { user: user._id, role: 'viewer' } } });
    const session = await issueRefreshToken(String(user._id));
    const key = await ApiKey.create({
      user: user._id,
      workspace: workspace._id,
      name: 'scim key',
      keyHash: crypto.randomBytes(32).toString('hex'),
      prefix: 'lnk_test_',
      maskedKey: 'lnk_test_...abcd',
      lastFour: 'abcd',
    });

    const res = await deliver(userEvent('dsync.user.deleted', dir, who));
    assert.strictEqual(res.body.outcome, 'deprovisioned');

    assert.strictEqual(await memberOf(workspace, user._id), undefined);
    assert.ok(await memberOf(otherOrg.workspace, user._id), 'other organizations untouched');
    assert.ok(await User.exists({ _id: user._id }), 'deactivated, not hard-deleted');
    assert.strictEqual(await consumeRefreshToken(session), null, 'sessions signed out');
    assert.strictEqual((await ApiKey.findById(key._id)).status, 'revoked');
    assert.strictEqual((await DirectoryUser.findOne({ organization: orgId, directoryUserId: who.id })).state, 'deprovisioned');
  });

  it('treats an update to state inactive as a deprovision, ignores stale events, and restores on reactivation', async () => {
    const { workspace, dir } = await makeOrg();
    const who = newDirectoryUser();
    const t0 = Date.now() - 60_000;
    await deliver(userEvent('dsync.user.created', dir, who, { createdAt: new Date(t0) }));
    const user = await User.findOne({ email: who.email });

    const inactive = await deliver(userEvent('dsync.user.updated', dir, who, { createdAt: new Date(t0 + 2000), state: 'inactive' }));
    assert.strictEqual(inactive.body.outcome, 'deprovisioned');
    assert.strictEqual(await memberOf(workspace, user._id), undefined);

    // An older "active" update delivered late must not re-add them.
    const stale = await deliver(userEvent('dsync.user.updated', dir, who, { createdAt: new Date(t0 + 1000) }));
    assert.strictEqual(stale.body.outcome, 'ignored:stale');
    assert.strictEqual(await memberOf(workspace, user._id), undefined);

    const back = await deliver(userEvent('dsync.user.updated', dir, who, { createdAt: new Date(t0 + 3000) }));
    assert.strictEqual(back.body.outcome, 'provisioned');
    assert.strictEqual((await memberOf(workspace, user._id)).managedBy, 'scim');
  });

  it("never removes a workspace's last owner", async () => {
    const { owner, workspace, dir } = await makeOrg();
    const who = { id: `directory_user_${hex()}`, email: owner.user.email };
    await deliver(userEvent('dsync.user.created', dir, who, { createdAt: new Date(Date.now() - 5000) })); // linked
    await deliver(userEvent('dsync.user.deleted', dir, who));
    assert.strictEqual((await memberOf(workspace, owner.user._id)).role, 'owner');
  });
});

describe('manual member changes for directory-managed people', () => {
  it('are refused for removal, invite and re-adding; role changes still work', async () => {
    const { admin, workspace, dir } = await makeOrg();
    const who = newDirectoryUser();
    await deliver(userEvent('dsync.user.created', dir, who));
    const user = await User.findOne({ email: who.email });

    const remove = await request(app).delete(`/api/workspaces/${workspace._id}/members/${user._id}`).set(authHeader(admin.token));
    assert.strictEqual(remove.status, 409);
    assert.strictEqual(remove.body.code, 'DIRECTORY_MANAGED');
    assert.match(remove.body.message, /identity provider/);

    const invite = await request(app)
      .post(`/api/workspaces/${workspace._id}/invites`)
      .set(authHeader(admin.token))
      .send({ email: who.email, role: 'viewer' });
    assert.strictEqual(invite.status, 409);
    assert.strictEqual(invite.body.code, 'DIRECTORY_MANAGED');

    const roleChange = await request(app)
      .post(`/api/workspaces/${workspace._id}/members`)
      .set(authHeader(admin.token))
      .send({ email: who.email, role: 'viewer' });
    assert.strictEqual(roleChange.status, 200);
    assert.strictEqual((await memberOf(workspace, user._id)).role, 'viewer');

    // After the directory removes them, admins can't just add them back.
    await deliver(userEvent('dsync.user.deleted', dir, who, { createdAt: new Date(Date.now() + 1000) }));
    const readd = await request(app)
      .post(`/api/workspaces/${workspace._id}/members`)
      .set(authHeader(admin.token))
      .send({ email: who.email, role: 'viewer' });
    assert.strictEqual(readd.status, 409);
  });
});

describe('PATCH /organizations/:organizationId/directory-sync', () => {
  const path = (orgId) => `/api/workspaces/organizations/${orgId}/directory-sync`;

  it('only an owner can configure it, with validated settings', async () => {
    const owner = await makeUser('Setup Owner');
    const admin = await makeUser('Setup Admin');
    await Workspace.updateOne({ _id: owner.workspace._id }, { $push: { members: { user: admin.user._id, role: 'admin' } } });
    const orgId = owner.workspace.organization;
    const patch = (who, body) => request(app).patch(path(orgId)).set(authHeader(who.token)).send(body);

    assert.strictEqual((await patch(admin, { enabled: true, directoryId: directoryId() })).status, 403);
    assert.strictEqual((await patch(owner, { enabled: true })).status, 400, 'needs a directory id');
    assert.strictEqual((await patch(owner, { directoryId: 'not-a-directory' })).status, 400);
    assert.strictEqual((await patch(owner, { defaultRole: 'owner' })).status, 400);

    env.WORKOS_WEBHOOK_SECRET = '';
    assert.strictEqual((await patch(owner, { enabled: true, directoryId: directoryId() })).status, 409);
    env.WORKOS_WEBHOOK_SECRET = SECRET;

    const dir = directoryId();
    const ok = await patch(owner, { enabled: true, directoryId: dir, defaultRole: 'viewer' });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.directorySync.enabled, true);
    assert.strictEqual(ok.body.directorySync.directoryId, dir);
    assert.strictEqual(ok.body.directorySync.defaultRoleName, 'viewer');
    assert.strictEqual(ok.body.directorySync.webhookPath, '/api/auth/sso/scim/events');

    const other = await makeUser('Other Setup Owner');
    const clash = await request(app).patch(path(other.workspace.organization)).set(authHeader(other.token)).send({ directoryId: dir });
    assert.strictEqual(clash.status, 409, 'one org per directory');

    await new Promise((r) => setTimeout(r, 50));
    assert.ok(await AuditLog.exists({ action: 'organization.directory_sync.update', workspace: owner.workspace._id }));
  });

  it('a custom role in use as the default role cannot be deleted', async () => {
    const { owner, workspace, orgId } = await makeOrg();
    const role = await CustomRole.create({ organization: orgId, name: `Default ${hex()}`, permissions: ['links:read'] });
    await Organization.updateOne({ _id: orgId }, { $set: { 'directorySync.defaultRole': String(role._id) } });
    const res = await request(app).delete(`/api/workspaces/${workspace._id}/roles/${role._id}`).set(authHeader(owner.token));
    assert.strictEqual(res.status, 409);
    assert.match(res.body.message, /default role for directory-provisioned members/);
  });
});
