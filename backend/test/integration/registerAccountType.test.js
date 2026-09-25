import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, authHeader, resetRateLimits } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import { closeRedis } from '../../src/services/cacheService.js';

const createdEmails = [];
const run = crypto.randomBytes(4).toString('hex');

function uniqueEmail(label) {
  const email = `signup-${label}-${run}@example.com`;
  createdEmails.push(email);
  return email;
}

function register(body) {
  return request(app)
    .post('/api/auth/register')
    .send({ name: 'Signup Tester', password: 'Password123', ...body });
}

async function workspacesOwnedBy(email) {
  const user = await User.findOne({ email });
  const orgs = await Organization.find({ owner: user._id }).lean();
  const workspaces = await Workspace.find({ organization: { $in: orgs.map((o) => o._id) } }).lean();
  return { user, orgs, workspaces };
}

beforeAll(async () => {
  await connectTestDb();
});

// The register limiter allows 10/hour per IP and other suites register too.
beforeEach(async () => {
  await resetRateLimits(['register']);
});

afterAll(async () => {
  const userIds = await User.find({ email: { $in: createdEmails } }).distinct('_id');
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  await Workspace.deleteMany({ organization: { $in: orgIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('register: personal account (default)', () => {
  for (const [label, extra] of [
    ['accountType omitted', {}],
    ["accountType 'personal'", { accountType: 'personal' }],
  ]) {
    it(`${label} creates "{name}'s Organization" with a "Personal" workspace, as before`, async () => {
      const email = uniqueEmail(label.includes('omitted') ? 'omit' : 'personal');
      const res = await register({ email, ...extra, organizationName: extra.accountType ? 'Ignored Inc' : undefined });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.activeWorkspace.name, 'Personal');
      assert.strictEqual(res.body.activeWorkspace.role, 'owner');

      const { user, orgs, workspaces } = await workspacesOwnedBy(email);
      assert.deepStrictEqual(
        orgs.map((o) => o.name),
        ["Signup Tester's Organization"]
      );
      assert.deepStrictEqual(
        workspaces.map((w) => w.name),
        ['Personal']
      );
      assert.strictEqual(String(user.activeWorkspace), String(workspaces[0]._id));
    });
  }
});

describe('register: organization account', () => {
  it('creates an Organization with that exact name and a "Main" workspace owned by the user', async () => {
    const email = uniqueEmail('org');
    const organizationName = `Acme Robotics ${run}`;
    const res = await register({ email, accountType: 'organization', organizationName: `  ${organizationName}  ` });

    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.activeWorkspace.name, 'Main');
    assert.strictEqual(res.body.activeWorkspace.role, 'owner');
    // Same response shape as a personal signup: nothing plan/seat/billing-like.
    assert.deepStrictEqual(Object.keys(res.body).sort(), ['activeWorkspace', 'expiresIn', 'success', 'token', 'user']);

    const { user, orgs, workspaces } = await workspacesOwnedBy(email);
    assert.strictEqual(orgs.length, 1);
    assert.strictEqual(orgs[0].name, organizationName);
    assert.deepStrictEqual(Object.keys(orgs[0]).sort(), ['__v', '_id', 'auditRetentionDays', 'createdAt', 'directorySync', 'ipAllowlist', 'name', 'owner', 'slug', 'sso', 'ssoEnforced', 'updatedAt']);
    assert.strictEqual(workspaces.length, 1);
    assert.strictEqual(workspaces[0].name, 'Main');
    assert.deepStrictEqual(
      workspaces[0].members.map((m) => ({ user: String(m.user), role: m.role })),
      [{ user: String(user._id), role: 'owner' }]
    );
    assert.strictEqual(String(user.activeWorkspace), String(workspaces[0]._id));

    // No invite limit or seat check: the owner can invite a handful straight away.
    for (let i = 0; i < 5; i += 1) {
      const invite = await request(app)
        .post(`/api/workspaces/${workspaces[0]._id}/invites`)
        .set(authHeader(res.body.token))
        .send({ email: `teammate-${i}-${run}@example.com`, role: 'creator' });
      assert.strictEqual(invite.status, 201, `invite ${i}: ${JSON.stringify(invite.body)}`);
    }
  });

  for (const [label, organizationName] of [
    ['missing', undefined],
    ['blank', '   '],
    ['too short', 'A'],
    ['too long', 'x'.repeat(101)],
    ['not a string', 42],
  ]) {
    it(`rejects a ${label} organizationName with 400 and writes nothing`, async () => {
      const email = uniqueEmail(`bad-${label.replace(/\s/g, '-')}`);

      const res = await register({ email, accountType: 'organization', organizationName });

      assert.strictEqual(res.status, 400);
      assert.match(res.body.message, /Organization name must be 2-100 characters/);
      // Orgs and workspaces are only ever created with the new user as
      // owner, so no user means neither was written; the name check covers
      // an org that might have been created before the user.
      assert.strictEqual(await User.exists({ email }), null);
      if (typeof organizationName === 'string' && organizationName.trim()) {
        assert.strictEqual(await Organization.exists({ name: organizationName.trim() }), null);
      }
    });
  }

  it('rejects an unknown accountType', async () => {
    const email = uniqueEmail('bad-type');
    const res = await register({ email, accountType: 'enterprise', organizationName: 'Acme' });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /accountType must be one of: personal, organization/);
    assert.strictEqual(await User.exists({ email }), null);
  });
});
