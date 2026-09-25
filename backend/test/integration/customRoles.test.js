import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader, resetRateLimits } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import CustomRole from '../../src/models/CustomRole.js';
import AuditLog from '../../src/models/AuditLog.js';
import { CUSTOM_ROLE_PERMISSIONS } from '../../src/utils/permissions.js';
import { closeRedis } from '../../src/services/cacheService.js';

const ANALYST_PERMISSIONS = ['links:read', 'analytics:read', 'analytics:detail', 'analytics:export'];

let owner;
let admin;
let viewer;
let workspace;
const created = [];

async function makeUser(name) {
  const user = await createTestUser({ name });
  created.push(user.user);
  return user;
}

async function addMember(member, role) {
  await Workspace.updateOne({ _id: workspace._id }, { $push: { members: { user: member.user._id, role } } });
  await User.updateOne({ _id: member.user._id }, { $set: { activeWorkspace: workspace._id } });
}

const api = (who) => ({
  get: (path) => request(app).get(path).set(authHeader(who.token)),
  post: (path, body) => request(app).post(path).set(authHeader(who.token)).send(body),
  patch: (path, body) => request(app).patch(path).set(authHeader(who.token)).send(body),
  delete: (path) => request(app).delete(path).set(authHeader(who.token)),
});

const rolesPath = () => `/api/workspaces/${workspace._id}/roles`;
const createRole = (who, name, permissions) => api(who).post(rolesPath(), { name: `${name} ${crypto.randomBytes(3).toString('hex')}`, permissions });
const assign = (who, member, role) => api(who).post(`/api/workspaces/${workspace._id}/members`, { email: member.user.email, role });

async function waitForAudit(filter) {
  for (let i = 0; i < 20; i += 1) {
    if (await AuditLog.exists(filter)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

beforeAll(async () => {
  await connectTestDb();
  await resetRateLimits(['link-creation']);
  owner = await makeUser('Roles Owner');
  admin = await makeUser('Roles Admin');
  viewer = await makeUser('Roles Viewer');
  workspace = owner.workspace;
  await addMember(admin, 'admin');
  await addMember(viewer, 'viewer');
});

afterAll(async () => {
  const userIds = created.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  const workspaceIds = await Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
  await CustomRole.deleteMany({ organization: { $in: orgIds } });
  await AuditLog.deleteMany({ workspace: { $in: workspaceIds } });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('creating custom roles', () => {
  it('an admin creates one; it is audited and listed for every member', async () => {
    const res = await createRole(admin, 'Analyst', ANALYST_PERMISSIONS);
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.deepStrictEqual([...res.body.role.permissions].sort(), [...ANALYST_PERMISSIONS].sort());
    assert.ok(await waitForAudit({ action: 'organization.role.create', workspace: workspace._id, targetResourceId: String(res.body.role.id) }));

    const list = await api(viewer).get(rolesPath());
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.roles.some((r) => r.id === res.body.role.id));
    assert.deepStrictEqual(list.body.availablePermissions.map((p) => p.key), CUSTOM_ROLE_PERMISSIONS);
    assert.ok(list.body.availablePermissions.every((p) => p.description));
  });

  it('creators and viewers cannot manage roles', async () => {
    const res = await createRole(viewer, 'Nope', ['links:read']);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.message, 'Requires admin role or higher');
  });

  it('rejects owner-only or unknown permissions, built-in names and duplicate names', async () => {
    assert.strictEqual((await createRole(admin, 'Shadow owner', ['ownership:transfer'])).status, 400);
    assert.strictEqual((await createRole(admin, 'SSO boss', ['sso:manage'])).status, 400);
    assert.strictEqual((await createRole(admin, 'Typo', ['links:wirte'])).status, 400);
    assert.strictEqual((await api(admin).post(rolesPath(), { name: 'Admin', permissions: [] })).status, 400);

    const name = `Support ${crypto.randomBytes(3).toString('hex')}`;
    assert.strictEqual((await api(admin).post(rolesPath(), { name, permissions: ['links:read'] })).status, 201);
    assert.strictEqual((await api(admin).post(rolesPath(), { name: name.toUpperCase(), permissions: [] })).status, 409);
  });
});

describe('assigning a custom role', () => {
  it('a member with the role gets exactly its permissions, everywhere they are checked', async () => {
    const role = (await createRole(admin, 'Analyst', ANALYST_PERMISSIONS)).body.role;
    const analyst = await makeUser('Analyst Member');
    await addMember(analyst, 'viewer');
    assert.strictEqual((await assign(admin, analyst, role.id)).status, 200);

    const me = await api(analyst).get('/api/auth/me');
    assert.strictEqual(me.body.activeWorkspace.role, role.id);
    assert.strictEqual(me.body.activeWorkspace.roleName, role.name);
    assert.deepStrictEqual([...me.body.activeWorkspace.permissions].sort(), [...ANALYST_PERMISSIONS].sort());

    // Allowed by the role (export is creator-level on the built-in ladder)...
    assert.strictEqual((await api(analyst).get('/api/links')).status, 200);
    assert.strictEqual((await api(analyst).get('/api/analytics/export')).status, 200);
    const summary = await api(analyst).get('/api/analytics/summary/all');
    assert.strictEqual(summary.body.summary.detailRestricted, false);
    // ...and not what it lacks.
    assert.strictEqual((await api(analyst).post('/api/links', { originalUrl: 'https://example.com/x' })).status, 403);
    assert.strictEqual((await api(analyst).get('/api/webhooks')).status, 403);
  });

  it('works through invites too', async () => {
    const role = (await createRole(admin, 'Invitee role', ['links:read', 'links:write'])).body.role;
    const invite = await api(admin).post(`/api/workspaces/${workspace._id}/invites`, { email: `cr-${crypto.randomBytes(3).toString('hex')}@example.com`, role: role.id });
    assert.strictEqual(invite.status, 201, JSON.stringify(invite.body));
    assert.strictEqual(invite.body.invite.role, role.id);
  });

  it('editing a role changes what its members can do on their next request', async () => {
    const role = (await createRole(admin, 'Growing', ['links:read'])).body.role;
    const member = await makeUser('Growing Member');
    await addMember(member, role.id);
    assert.strictEqual((await api(member).get('/api/analytics/summary/all')).status, 403);

    const patched = await api(admin).patch(`${rolesPath()}/${role.id}`, { permissions: ['links:read', 'analytics:read'] });
    assert.strictEqual(patched.status, 200);
    assert.strictEqual((await api(member).get('/api/analytics/summary/all')).status, 200);
    assert.ok(await waitForAudit({ action: 'organization.role.update', targetResourceId: String(role.id) }));
  });

  it("rejects a role id from another organization", async () => {
    const other = await makeUser('Other org owner');
    const foreign = await CustomRole.create({ organization: other.workspace.organization, name: 'Foreign', permissions: ['links:read'] });
    const target = await makeUser('Foreign target');
    await addMember(target, 'viewer');
    assert.strictEqual((await assign(admin, target, String(foreign._id))).status, 400);
  });
});

describe('no escalation through custom roles', () => {
  it('a role with members:manage can only grant and change what it holds itself', async () => {
    const role = (await createRole(admin, 'People manager', ['links:read', 'members:manage'])).body.role;
    const manager = await makeUser('Manager');
    await addMember(manager, role.id);
    const target = await makeUser('Target');
    await addMember(target, role.id);

    // Built-in roles with permissions the manager lacks.
    for (const builtIn of ['admin', 'creator', 'viewer']) {
      const res = await assign(manager, target, builtIn);
      assert.strictEqual(res.status, 403, builtIn);
    }
    // Can't touch someone broader (the admin), even to "demote" them.
    assert.strictEqual((await assign(manager, admin, role.id)).status, 403);
    assert.strictEqual((await api(manager).delete(`/api/workspaces/${workspace._id}/members/${admin.user._id}`)).status, 403);

    // Its own role is fine.
    const invite = await api(manager).post(`/api/workspaces/${workspace._id}/invites`, { email: `pm-${crypto.randomBytes(3).toString('hex')}@example.com`, role: role.id });
    assert.strictEqual(invite.status, 201);
  });
});

describe('deleting custom roles', () => {
  it('is blocked while any member holds the role, then allowed and audited', async () => {
    const role = (await createRole(admin, 'Temp', ['links:read'])).body.role;
    const member = await makeUser('Temp Member');
    await addMember(member, role.id);

    const blocked = await api(admin).delete(`${rolesPath()}/${role.id}`);
    assert.strictEqual(blocked.status, 409);
    assert.match(blocked.body.message, /still assigned to 1 member/);
    assert.ok(await CustomRole.exists({ _id: role.id }));

    assert.strictEqual((await assign(admin, member, 'viewer')).status, 200);
    const deleted = await api(admin).delete(`${rolesPath()}/${role.id}`);
    assert.strictEqual(deleted.status, 200);
    assert.strictEqual(await CustomRole.exists({ _id: role.id }), null);
    assert.ok(await waitForAudit({ action: 'organization.role.delete', targetResourceId: String(role.id) }));
  });

  it('is blocked while a pending invite uses the role', async () => {
    const role = (await createRole(admin, 'Invited only', ['links:read'])).body.role;
    await api(admin).post(`/api/workspaces/${workspace._id}/invites`, { email: `ip-${crypto.randomBytes(3).toString('hex')}@example.com`, role: role.id });
    const blocked = await api(admin).delete(`${rolesPath()}/${role.id}`);
    assert.strictEqual(blocked.status, 409);
    assert.match(blocked.body.message, /1 pending invite/);
  });
});
