import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import Link from '../../src/models/Link.js';
import ApiKey from '../../src/models/ApiKey.js';
import Webhook from '../../src/models/Webhook.js';
import CustomDomain from '../../src/models/CustomDomain.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { migrateUsersToWorkspaces } from '../../scripts/migrate-users-to-workspaces.js';

const RESOURCE_MODELS = [Link, ApiKey, Webhook, CustomDomain];

const testUsers = [];

async function createUserWithResources(overrides = {}) {
  const { user } = await createTestUser(overrides, { withWorkspace: false });
  testUsers.push(user);
  const suffix = crypto.randomBytes(6).toString('hex');

  const links = await Promise.all(
    [1, 2].map((n) =>
      Link.create({
        originalUrl: `https://example.com/${suffix}/${n}`,
        shortCode: `ws${suffix}${n}`,
        shortUrl: `https://example.com/ws${suffix}${n}`,
        user: user._id,
      })
    )
  );
  const apiKey = await ApiKey.create({
    user: user._id,
    name: 'migration test key',
    keyHash: crypto.randomBytes(32).toString('hex'),
    prefix: 'lnk_test_',
    maskedKey: 'lnk_test_****abcd',
    lastFour: 'abcd',
  });
  const webhook = await Webhook.create({
    user: user._id,
    url: 'https://example.com/hook',
    events: ['link.created'],
    secret: 'whsec_test',
  });
  const domain = await CustomDomain.create({ user: user._id, domain: `ws-${suffix}.example.com` });

  return { user, links, apiKey, webhook, domain };
}

async function ownedWorkspaceIds(userId) {
  const orgIds = await Organization.find({ owner: userId }).distinct('_id');
  return Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
}

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  const userIds = testUsers.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  await Workspace.deleteMany({ organization: { $in: orgIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  for (const Model of RESOURCE_MODELS) await Model.deleteMany({ user: { $in: userIds } });
  await mongoose.model('User').deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('migrateUsersToWorkspaces', () => {
  it('creates a personal org + workspace and backfills every owned resource into it', async () => {
    const alice = await createUserWithResources({ name: 'Alice' });
    const bob = await createUserWithResources({ name: 'Bob' });

    const { users, resources } = await migrateUsersToWorkspaces();
    assert.ok(users.migrated >= 2);
    assert.ok(resources.Link.migrated >= 4);
    assert.ok(resources.ApiKey.migrated >= 2);
    assert.ok(resources.Webhook.migrated >= 2);
    assert.ok(resources.CustomDomain.migrated >= 2);

    for (const { user, links, apiKey, webhook, domain } of [alice, bob]) {
      const reloadedUser = await User.findById(user._id);
      assert.ok(reloadedUser.activeWorkspace);

      const workspace = await Workspace.findById(reloadedUser.activeWorkspace);
      assert.strictEqual(workspace.name, 'Personal');
      assert.deepStrictEqual(
        workspace.members.map((m) => ({ user: String(m.user), role: m.role })),
        [{ user: String(user._id), role: 'owner' }]
      );

      const org = await Organization.findById(workspace.organization);
      assert.strictEqual(String(org.owner), String(user._id));
      assert.strictEqual(org.name, `${user.name}'s Organization`);

      const expected = String(workspace._id);
      for (const link of links) assert.strictEqual(String((await Link.findById(link._id)).workspace), expected);
      assert.strictEqual(String((await ApiKey.findById(apiKey._id)).workspace), expected);
      assert.strictEqual(String((await Webhook.findById(webhook._id)).workspace), expected);
      assert.strictEqual(String((await CustomDomain.findById(domain._id)).workspace), expected);
    }

    // Each user's resources went to their own workspace, not a shared one.
    const aliceWs = (await User.findById(alice.user._id)).activeWorkspace;
    const bobWs = (await User.findById(bob.user._id)).activeWorkspace;
    assert.notStrictEqual(String(aliceWs), String(bobWs));
  });

  it('is a no-op for already-migrated users when re-run', async () => {
    const { user, links } = await createUserWithResources({ name: 'Carol' });
    await migrateUsersToWorkspaces();

    const before = await User.findById(user._id);
    const workspacesBefore = await ownedWorkspaceIds(user._id);
    const orgCountBefore = await Organization.countDocuments({ owner: user._id });

    await migrateUsersToWorkspaces();

    const after = await User.findById(user._id);
    assert.strictEqual(String(after.activeWorkspace), String(before.activeWorkspace));
    assert.deepStrictEqual((await ownedWorkspaceIds(user._id)).map(String), workspacesBefore.map(String));
    assert.strictEqual(await Organization.countDocuments({ owner: user._id }), orgCountBefore);
    for (const link of links) {
      assert.strictEqual(String((await Link.findById(link._id)).workspace), String(before.activeWorkspace));
    }
  });

  it('reuses the workspace left by an interrupted run instead of creating a second one', async () => {
    const { user, links } = await createUserWithResources({ name: 'Dave' });
    const org = await Organization.create({ name: "Dave's Organization", slug: `dave-${Date.now().toString(36)}`, owner: user._id });
    const leftover = await Workspace.create({
      organization: org._id,
      name: 'Personal',
      members: [{ user: user._id, role: 'owner' }],
    });

    await migrateUsersToWorkspaces();

    const reloadedUser = await User.findById(user._id);
    assert.strictEqual(String(reloadedUser.activeWorkspace), String(leftover._id));
    assert.strictEqual(await Organization.countDocuments({ owner: user._id }), 1);
    for (const link of links) {
      assert.strictEqual(String((await Link.findById(link._id)).workspace), String(leftover._id));
    }
  });

  it('falls back to "Personal" as the org name when the user has no usable name', async () => {
    const { user } = await createUserWithResources({ name: 'Erin' });
    // name is schema-required, so a blank one can only come from legacy data.
    await User.updateOne({ _id: user._id }, { $set: { name: '   ' } });

    await migrateUsersToWorkspaces();

    const reloadedUser = await User.findById(user._id);
    const workspace = await Workspace.findById(reloadedUser.activeWorkspace);
    const org = await Organization.findById(workspace.organization);
    assert.strictEqual(org.name, 'Personal');
    assert.match(org.slug, /^personal-/);
  });
});
