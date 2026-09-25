import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import AuditLog from '../../src/models/AuditLog.js';
import { purgeExpiredAuditLogs } from '../../src/services/auditRetentionService.js';
import { closeRedis } from '../../src/services/cacheService.js';

const DAY = 24 * 60 * 60 * 1000;
const created = [];

async function makeUser(name) {
  const user = await createTestUser({ name });
  created.push(user.user);
  return user;
}

/** An org (the owner's personal one) with admin + creator members. */
async function makeOrg() {
  const owner = await makeUser('Audit Owner');
  const members = {};
  for (const role of ['admin', 'creator']) {
    members[role] = await makeUser(`Audit ${role}`);
    await Workspace.updateOne({ _id: owner.workspace._id }, { $push: { members: { user: members[role].user._id, role } } });
  }
  return { owner, members, workspace: owner.workspace, orgId: owner.workspace.organization };
}

const entryAged = (workspace, days, extra = {}) =>
  AuditLog.create({ action: 'link.create', workspace, timestamp: new Date(Date.now() - days * DAY), ...extra });

/** Minimal RFC 4180 parser for the fully-quoted CSV the export writes. */
function parseCsv(text) {
  return text
    .trimEnd()
    .split('\n')
    .map((line) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"')));
}

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  const userIds = created.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  const workspaceIds = await Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
  await AuditLog.deleteMany({ $or: [{ workspace: { $in: workspaceIds } }, { actorUserId: { $in: userIds } }] });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('GET /:workspaceId/activity/export', () => {
  it('streams the workspace audit log as correctly formatted, formula-safe CSV, newest first', async () => {
    const { members, workspace } = await makeOrg();
    const other = await makeOrg();
    await entryAged(workspace._id, 2, { actorUserId: members.creator.user._id, targetResourceId: 'older', diff: { shortCode: 'abc' } });
    await entryAged(workspace._id, 1, {
      action: 'workspace.member.upsert',
      actorUserId: members.admin.user._id,
      targetResourceId: '=HYPERLINK("http://evil")',
      ipAddress: '203.0.113.9',
      diff: { member: 'a "quoted" name', role: 'viewer' },
    });
    await entryAged(other.workspace._id, 1, { targetResourceId: 'other-workspace' });

    const res = await request(app).get(`/api/workspaces/${workspace._id}/activity/export`).set(authHeader(members.admin.token));
    assert.strictEqual(res.status, 200);
    assert.match(res.headers['content-type'], /^text\/csv/);
    assert.match(res.headers['content-disposition'], /^attachment; filename="linkora-activity-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.csv"$/);

    const rows = parseCsv(res.text);
    assert.deepStrictEqual(rows[0], ['Timestamp (UTC)', 'Actor', 'Actor email', 'Action', 'Target', 'Details']);
    const body = rows.slice(1);
    assert.strictEqual(body.length, 2, 'only this workspace’s entries');
    assert.ok(body.every((r) => r.length === 6));

    const [newest, older] = body;
    assert.match(newest[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepStrictEqual(newest.slice(1, 5), ['Audit admin', members.admin.user.email, 'workspace.member.upsert', `'=HYPERLINK("http://evil")`]);
    assert.deepStrictEqual(JSON.parse(newest[5]), { member: 'a "quoted" name', role: 'viewer' });
    assert.strictEqual(older[4], 'older');
    assert.ok(!res.text.includes('203.0.113.9'), 'actor IPs are not exported');

    // The export is itself audited.
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(await AuditLog.exists({ action: 'workspace.activity.export', workspace: workspace._id, actorUserId: members.admin.user._id }));
  });

  it('is admin+ only', async () => {
    const { members, workspace } = await makeOrg();
    const res = await request(app).get(`/api/workspaces/${workspace._id}/activity/export`).set(authHeader(members.creator.token));
    assert.strictEqual(res.status, 403);
  });
});

describe('audit retention cleanup', () => {
  it("deletes each org's entries past its configured window and keeps newer ones", async () => {
    const thirtyDays = await makeOrg();
    const forever = await makeOrg();
    const defaults = await makeOrg(); // 365 days
    await Organization.updateOne({ _id: thirtyDays.orgId }, { $set: { auditRetentionDays: 30 } });
    await Organization.updateOne({ _id: forever.orgId }, { $set: { auditRetentionDays: null } });

    const recent30 = await entryAged(thirtyDays.workspace._id, 10);
    const old30 = await entryAged(thirtyDays.workspace._id, 40);
    const ancient = await entryAged(forever.workspace._id, 5000);
    const recentDefault = await entryAged(defaults.workspace._id, 300);
    const oldDefault = await entryAged(defaults.workspace._id, 400);
    // Account-level entries (no workspace) use the 365-day default.
    const accountRecent = await AuditLog.create({ action: 'auth.login.success', actorUserId: defaults.owner.user._id, timestamp: new Date(Date.now() - 100 * DAY) });
    const accountOld = await AuditLog.create({ action: 'auth.login.success', actorUserId: defaults.owner.user._id, timestamp: new Date(Date.now() - 400 * DAY) });

    await purgeExpiredAuditLogs();

    const exists = async (doc) => Boolean(await AuditLog.exists({ _id: doc._id }));
    assert.strictEqual(await exists(recent30), true);
    assert.strictEqual(await exists(old30), false);
    assert.strictEqual(await exists(ancient), true, 'null retention keeps forever');
    assert.strictEqual(await exists(recentDefault), true);
    assert.strictEqual(await exists(oldDefault), false);
    assert.strictEqual(await exists(accountRecent), true);
    assert.strictEqual(await exists(accountOld), false);
  });

  it('never goes below the 30-day floor, even if the stored value is lower', async () => {
    const { orgId, workspace } = await makeOrg();
    await Organization.collection.updateOne({ _id: orgId }, { $set: { auditRetentionDays: 1 } });
    const tenDaysOld = await entryAged(workspace._id, 10);
    await purgeExpiredAuditLogs();
    assert.ok(await AuditLog.exists({ _id: tenDaysOld._id }));
  });
});

describe('PATCH /organizations/:organizationId/audit-settings', () => {
  const path = (orgId) => `/api/workspaces/organizations/${orgId}/audit-settings`;
  const patch = (who, orgId, body) => request(app).patch(path(orgId)).set(authHeader(who.token)).send(body);

  it('only an owner can change retention; non-members get 404', async () => {
    const { members, orgId } = await makeOrg();
    for (const role of ['admin', 'creator']) {
      const res = await patch(members[role], orgId, { auditRetentionDays: 90 });
      assert.strictEqual(res.status, 403, role);
      assert.strictEqual(res.body.message, 'Requires owner role or higher');
    }
    const outsider = await makeUser('Audit outsider');
    assert.strictEqual((await patch(outsider, orgId, { auditRetentionDays: 90 })).status, 404);
    assert.strictEqual((await Organization.findById(orgId).lean()).auditRetentionDays, 365);
  });

  it('an owner sets any whole number of days from 30 up, or forever, and it is audited', async () => {
    const { owner, orgId, workspace } = await makeOrg();

    const ninety = await patch(owner, orgId, { auditRetentionDays: 90 });
    assert.strictEqual(ninety.status, 200);
    assert.deepStrictEqual(ninety.body.audit, { auditRetentionDays: 90, minRetentionDays: 30 });

    const huge = await patch(owner, orgId, { auditRetentionDays: 36500 });
    assert.strictEqual(huge.body.audit.auditRetentionDays, 36500, 'no plan-based cap');

    const keepForever = await patch(owner, orgId, { auditRetentionDays: null });
    assert.strictEqual(keepForever.body.audit.auditRetentionDays, null);
    const zero = await patch(owner, orgId, { auditRetentionDays: 0 });
    assert.strictEqual(zero.body.audit.auditRetentionDays, null, '0 also means forever');

    await new Promise((r) => setTimeout(r, 50));
    const audit = await AuditLog.findOne({ action: 'organization.audit_settings.update', workspace: workspace._id })
      .sort({ timestamp: 1 })
      .lean();
    assert.deepStrictEqual(audit.diff, { auditRetentionDays: { before: 365, after: 90 } });
  });

  it('rejects values under the 30-day floor and non-integers', async () => {
    const { owner, orgId } = await makeOrg();
    for (const bad of [29, 1, -5, 45.5, '90', true]) {
      assert.strictEqual((await patch(owner, orgId, { auditRetentionDays: bad })).status, 400, String(bad));
    }
    assert.strictEqual((await Organization.findById(orgId).lean()).auditRetentionDays, 365);
  });
});
