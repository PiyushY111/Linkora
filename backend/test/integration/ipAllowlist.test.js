import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import ApiKey from '../../src/models/ApiKey.js';
import AuditLog from '../../src/models/AuditLog.js';
import { closeRedis } from '../../src/services/cacheService.js';

// The app trusts one proxy hop, so X-Forwarded-For sets the client IP.
const OFFICE_RANGE = '203.0.113.0/24';
const VPN_IP = '198.51.100.10';
const IN_RANGE = '203.0.113.77';
const OUTSIDE = '192.0.2.1';

const created = [];

async function makeUser(name) {
  const user = await createTestUser({ name });
  created.push(user.user);
  return user;
}

/** An org (the owner's personal one) with admin + creator members active in it. */
async function makeOrg() {
  const owner = await makeUser('IP Owner');
  const members = {};
  for (const role of ['admin', 'creator']) {
    members[role] = await makeUser(`IP ${role}`);
    await Workspace.updateOne({ _id: owner.workspace._id }, { $push: { members: { user: members[role].user._id, role } } });
    await User.updateOne({ _id: members[role].user._id }, { $set: { activeWorkspace: owner.workspace._id } });
  }
  return { owner, members, workspace: owner.workspace, orgId: owner.workspace.organization };
}

const from = (ip, who) => ({
  get: (path) => request(app).get(path).set('X-Forwarded-For', ip).set(authHeader(who.token)),
  put: (path, body) => request(app).put(path).set('X-Forwarded-For', ip).set(authHeader(who.token)).send(body),
  patch: (path, body) => request(app).patch(path).set('X-Forwarded-For', ip).set(authHeader(who.token)).send(body),
});

const setAllowlist = (orgId, list) => Organization.updateOne({ _id: orgId }, { $set: { ipAllowlist: list } });

async function apiKeyFor(member, workspace) {
  const raw = `lnk_test_${crypto.randomBytes(24).toString('hex')}`;
  await ApiKey.create({
    user: member.user._id,
    workspace: workspace._id,
    name: 'ip test key',
    keyHash: crypto.createHash('sha256').update(raw).digest('hex'),
    prefix: raw.slice(0, 12),
    maskedKey: `${raw.slice(0, 12)}...${raw.slice(-4)}`,
    lastFour: raw.slice(-4),
  });
  return raw;
}

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  const userIds = created.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  const workspaceIds = await Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
  await ApiKey.deleteMany({ workspace: { $in: workspaceIds } });
  await AuditLog.deleteMany({ workspace: { $in: workspaceIds } });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('member requests', () => {
  it('are allowed from anywhere when the list is empty (the default)', async () => {
    const { members, orgId } = await makeOrg();
    assert.deepStrictEqual((await Organization.findById(orgId).lean()).ipAllowlist, []);
    assert.strictEqual((await from(OUTSIDE, members.creator).get('/api/links')).status, 200);
  });

  it('are blocked from a non-allowlisted IP once the list is non-empty', async () => {
    const { members, orgId, workspace } = await makeOrg();
    await setAllowlist(orgId, [OFFICE_RANGE, VPN_IP]);

    const blocked = await from(OUTSIDE, members.creator).get('/api/links');
    assert.strictEqual(blocked.status, 403);
    assert.strictEqual(blocked.body.code, 'IP_NOT_ALLOWED');
    assert.match(blocked.body.message, new RegExp(OUTSIDE.replace(/\./g, '\\.')));

    // Workspaces reached through the URL are covered too.
    const detail = await from(OUTSIDE, members.creator).get(`/api/workspaces/${workspace._id}`);
    assert.strictEqual(detail.status, 403);
    assert.strictEqual(detail.body.code, 'IP_NOT_ALLOWED');
  });

  it('are allowed from an exact allowlisted IP or one inside an allowlisted CIDR range', async () => {
    const { members, orgId } = await makeOrg();
    await setAllowlist(orgId, [OFFICE_RANGE, VPN_IP]);
    assert.strictEqual((await from(VPN_IP, members.creator).get('/api/links')).status, 200);
    assert.strictEqual((await from(IN_RANGE, members.creator).get('/api/links')).status, 200);
    assert.strictEqual((await from('203.0.114.1', members.creator).get('/api/links')).status, 403);
  });

  it('can still use account routes and switch to another workspace from outside the range', async () => {
    const { members, orgId } = await makeOrg();
    await setAllowlist(orgId, [OFFICE_RANGE]);
    const member = members.creator;

    assert.strictEqual((await from(OUTSIDE, member).get('/api/auth/me')).status, 200);
    const switched = await from(OUTSIDE, member).put('/api/auth/me/active-workspace', { workspaceId: String(member.workspace._id) });
    assert.strictEqual(switched.status, 200);
    // Their own personal workspace has no allowlist.
    assert.strictEqual((await from(OUTSIDE, member).get('/api/links')).status, 200);
  });
});

describe('API key requests', () => {
  it('follow the allowlist of the key’s organization', async () => {
    const { members, orgId, workspace } = await makeOrg();
    const key = await apiKeyFor(members.admin, workspace);

    const open = await request(app).get('/api/public/v1/links').set('X-Forwarded-For', OUTSIDE).set('x-api-key', key);
    assert.strictEqual(open.status, 200, 'empty list: allowed');

    await setAllowlist(orgId, [OFFICE_RANGE]);
    const blocked = await request(app).get('/api/public/v1/links').set('X-Forwarded-For', OUTSIDE).set('x-api-key', key);
    assert.strictEqual(blocked.status, 403);
    assert.strictEqual(blocked.body.code, 'IP_NOT_ALLOWED');

    const allowed = await request(app).get('/api/public/v1/links').set('X-Forwarded-For', IN_RANGE).set('x-api-key', key);
    assert.strictEqual(allowed.status, 200);

    // Every API-key route is covered, including ones without a permission check.
    const usage = await request(app).get('/api/public/v1/usage').set('X-Forwarded-For', OUTSIDE).set('x-api-key', key);
    assert.strictEqual(usage.status, 403);
  });
});

describe('PATCH /organizations/:organizationId/ip-allowlist', () => {
  const path = (orgId) => `/api/workspaces/organizations/${orgId}/ip-allowlist`;

  it('only an owner can edit the list; non-members get 404', async () => {
    const { members, orgId } = await makeOrg();
    for (const role of ['admin', 'creator']) {
      const res = await from(IN_RANGE, members[role]).patch(path(orgId), { ipAllowlist: [OFFICE_RANGE] });
      assert.strictEqual(res.status, 403, role);
      assert.strictEqual(res.body.message, 'Requires owner role or higher');
    }
    const outsider = await makeUser('IP Outsider');
    assert.strictEqual((await from(IN_RANGE, outsider).patch(path(orgId), { ipAllowlist: [] })).status, 404);
    assert.deepStrictEqual((await Organization.findById(orgId).lean()).ipAllowlist, []);
  });

  it('an owner saves a canonical list, which is audited', async () => {
    const { owner, orgId, workspace } = await makeOrg();
    const res = await from(IN_RANGE, owner).patch(path(orgId), { ipAllowlist: [` ${OFFICE_RANGE} `, `${VPN_IP}/32`, VPN_IP] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.ipAllowlist, { entries: [OFFICE_RANGE, VPN_IP], yourIp: IN_RANGE });
    assert.deepStrictEqual((await Organization.findById(orgId).lean()).ipAllowlist, [OFFICE_RANGE, VPN_IP]);

    await new Promise((r) => setTimeout(r, 50));
    const audit = await AuditLog.findOne({ action: 'organization.ip_allowlist.update', workspace: workspace._id }).lean();
    assert.deepStrictEqual(audit.diff, { added: [OFFICE_RANGE, VPN_IP], removed: [], entries: 2 });
  });

  it("refuses a list that would lock out the owner's own IP, and invalid entries", async () => {
    const { owner, orgId } = await makeOrg();
    const lockout = await from(OUTSIDE, owner).patch(path(orgId), { ipAllowlist: [OFFICE_RANGE] });
    assert.strictEqual(lockout.status, 400);
    assert.match(lockout.body.message, /must include your current IP address \(192\.0\.2\.1\)/);

    assert.strictEqual((await from(IN_RANGE, owner).patch(path(orgId), { ipAllowlist: ['10.0.0.0/33'] })).status, 400);
    assert.strictEqual((await from(IN_RANGE, owner).patch(path(orgId), { ipAllowlist: 'nope' })).status, 400);
    assert.deepStrictEqual((await Organization.findById(orgId).lean()).ipAllowlist, []);
  });

  it("can't be changed from outside the current list, even by an owner; clearing from inside works", async () => {
    const { owner, orgId } = await makeOrg();
    await setAllowlist(orgId, [OFFICE_RANGE]);

    const hijack = await from(OUTSIDE, owner).patch(path(orgId), { ipAllowlist: [OUTSIDE] });
    assert.strictEqual(hijack.status, 403);
    assert.strictEqual(hijack.body.code, 'IP_NOT_ALLOWED');

    const cleared = await from(IN_RANGE, owner).patch(path(orgId), { ipAllowlist: [] });
    assert.strictEqual(cleared.status, 200);
    assert.deepStrictEqual(cleared.body.ipAllowlist.entries, []);
  });
});
