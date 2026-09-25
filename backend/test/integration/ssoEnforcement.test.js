import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader, resetRateLimits } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import Organization from '../../src/models/Organization.js';
import Workspace from '../../src/models/Workspace.js';
import AuditLog from '../../src/models/AuditLog.js';
import { generateToken, issueRefreshToken, consumeRefreshToken, verifyAccessToken } from '../../src/utils/jwt.js';
import {
  consumeAuthorizationState,
  provisionUserFromProfile,
  SsoNotLinkedError,
} from '../../src/services/ssoService.js';
import { closeRedis } from '../../src/services/cacheService.js';

const PASSWORD = 'Password123'; // createTestUser's default
const suffix = () => crypto.randomBytes(6).toString('hex');
const connectionId = () => `conn_${suffix()}${suffix()}`;

const created = [];
let original;

async function makeUser(name) {
  const user = await createTestUser({ name });
  created.push(user.user);
  return user;
}

/** An org (the owner's personal one) with admin/creator/viewer members. */
async function makeOrg() {
  const owner = await makeUser('SSO Owner');
  const members = {};
  for (const role of ['admin', 'creator', 'viewer']) {
    members[role] = await makeUser(`SSO ${role}`);
    await Workspace.updateOne({ _id: owner.workspace._id }, { $push: { members: { user: members[role].user._id, role } } });
  }
  const orgId = owner.workspace.organization;
  return { owner, members, orgId, workspace: owner.workspace };
}

const enforceDirectly = (orgId, conn) =>
  Organization.updateOne({ _id: orgId }, { $set: { ssoConnectionId: conn, ssoEnforced: true } });

const login = (who) => request(app).post('/api/auth/login').send({ email: who.user.email, password: PASSWORD });

function ssoToken(who, conn) {
  return generateToken(who.user._id, { authMethod: 'sso', ssoConnectionId: conn });
}

const patchSso = (token, orgId, body) =>
  request(app).patch(`/api/workspaces/organizations/${orgId}/sso-settings`).set(authHeader(token)).send(body);

beforeAll(async () => {
  await connectTestDb();
  original = { SSO_ENABLED: env.SSO_ENABLED, WORKOS_CLIENT_ID: env.WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI: env.WORKOS_REDIRECT_URI };
  env.SSO_ENABLED = true;
  env.WORKOS_CLIENT_ID = 'test-client-id';
  env.WORKOS_REDIRECT_URI = 'http://localhost:5001/api/auth/sso/callback';
});

beforeEach(async () => {
  env.SSO_ENABLED = true;
  await resetRateLimits(['login', 'refresh']);
});

afterAll(async () => {
  Object.assign(env, original);
  const userIds = created.map((u) => u._id);
  const orgIds = await Organization.find({ owner: { $in: userIds } }).distinct('_id');
  const workspaceIds = await Workspace.find({ organization: { $in: orgIds } }).distinct('_id');
  await AuditLog.deleteMany({ workspace: { $in: workspaceIds } });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await Organization.deleteMany({ _id: { $in: orgIds } });
  await User.deleteMany({ $or: [{ _id: { $in: userIds } }, { email: /^jit-.*@sso-example\.com$/ }] });
  await disconnectTestDb();
  await closeRedis();
});

describe('password login under SSO enforcement', () => {
  it('works normally when the org does not enforce SSO', async () => {
    const { members } = await makeOrg();
    const res = await login(members.creator);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token);
    assert.strictEqual(verifyAccessToken(res.body.token).authMethod, 'password');
  });

  it('is refused with the SSO redirect when the org enforces SSO', async () => {
    const { members, orgId } = await makeOrg();
    const conn = connectionId();
    await enforceDirectly(orgId, conn);

    const res = await login(members.viewer);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, 'SSO_REQUIRED');
    assert.match(res.body.message, /requires single sign-on/);
    assert.strictEqual(res.body.token, undefined);
    assert.ok(!res.headers['set-cookie']?.some((c) => c.startsWith('refreshToken=') && !c.includes('Expires=Thu, 01 Jan 1970')));

    const url = new URL(res.body.ssoUrl);
    assert.strictEqual(`${url.origin}${url.pathname}`, 'https://api.workos.com/sso/authorize');
    assert.strictEqual(url.searchParams.get('connection'), conn);
    assert.strictEqual(await consumeAuthorizationState(url.searchParams.get('state')), true, 'state is minted and single-use');
  });

  it('says nothing about SSO to a wrong password, so accounts and orgs cannot be probed', async () => {
    const { members, orgId } = await makeOrg();
    await enforceDirectly(orgId, connectionId());
    const res = await request(app).post('/api/auth/login').send({ email: members.viewer.user.email, password: 'Wrong-password1' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, undefined);
    assert.strictEqual(res.body.ssoUrl, undefined);
  });

  it('applies to any org the user belongs to, not just the active workspace', async () => {
    const { members, orgId } = await makeOrg();
    await enforceDirectly(orgId, connectionId());
    // The member switches to their own personal workspace first.
    await User.updateOne({ _id: members.creator.user._id }, { $set: { activeWorkspace: members.creator.workspace._id } });
    const res = await login(members.creator);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, 'SSO_REQUIRED');
  });

  it('fails closed without a URL if the deployment has SSO turned off', async () => {
    const { members, orgId } = await makeOrg();
    await enforceDirectly(orgId, connectionId());
    env.SSO_ENABLED = false;
    const res = await login(members.admin);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.ssoUrl, undefined);
    assert.match(res.body.message, /Contact your administrator/);
  });

  it('ends a password session at its next refresh, but keeps renewing an SSO session', async () => {
    const { members, orgId } = await makeOrg();
    const conn = connectionId();
    const passwordRefresh = await issueRefreshToken(String(members.creator.user._id));
    const ssoRefresh = await issueRefreshToken(String(members.creator.user._id), undefined, { authMethod: 'sso', ssoConnectionId: conn });
    await enforceDirectly(orgId, conn);

    const refused = await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${passwordRefresh}`);
    assert.strictEqual(refused.status, 403);
    assert.strictEqual(refused.body.code, 'SSO_REQUIRED');

    const renewed = await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${ssoRefresh}`);
    assert.strictEqual(renewed.status, 200);
    assert.deepStrictEqual(
      { authMethod: verifyAccessToken(renewed.body.token).authMethod, conn: verifyAccessToken(renewed.body.token).ssoConnectionId },
      { authMethod: 'sso', conn }
    );
  });
});

describe('PATCH /organizations/:organizationId/sso-settings', () => {
  it('only an owner can change SSO settings; non-members get 404', async () => {
    const { members, orgId } = await makeOrg();
    for (const role of ['admin', 'creator', 'viewer']) {
      const res = await patchSso(members[role].token, orgId, { ssoConnectionId: connectionId() });
      assert.strictEqual(res.status, 403, role);
      assert.strictEqual(res.body.message, 'Requires owner role or higher');
    }
    const outsider = await makeUser('SSO Outsider');
    assert.strictEqual((await patchSso(outsider.token, orgId, { ssoEnforced: false })).status, 404);
    assert.strictEqual((await Organization.findById(orgId)).ssoConnectionId, undefined);
  });

  it('requires a connection before enforcing, and a valid-looking one', async () => {
    const { owner, orgId } = await makeOrg();
    assert.strictEqual((await patchSso(owner.token, orgId, { ssoEnforced: true })).status, 400);
    assert.strictEqual((await patchSso(owner.token, orgId, { ssoConnectionId: 'not a connection' })).status, 400);
    assert.strictEqual((await patchSso(owner.token, orgId, { somethingElse: 1 })).status, 400);
  });

  it('refuses to enforce from a password session, to prevent lockouts', async () => {
    const { owner, orgId } = await makeOrg();
    const conn = connectionId();
    const set = await patchSso(owner.token, orgId, { ssoConnectionId: conn });
    assert.strictEqual(set.status, 200);
    assert.deepStrictEqual([set.body.organization.ssoConnectionId, set.body.organization.ssoEnforced], [conn, false]);

    const res = await patchSso(owner.token, orgId, { ssoEnforced: true });
    assert.strictEqual(res.status, 403);
    assert.match(res.body.message, /Sign in with SSO through/);
    assert.strictEqual((await Organization.findById(orgId)).ssoEnforced, false);
  });

  it('enforces from an SSO session through that connection, audits it, and ends members’ password sessions', async () => {
    const { owner, members, orgId, workspace } = await makeOrg();
    const conn = connectionId();
    await Organization.updateOne({ _id: orgId }, { $set: { ssoConnectionId: conn } });
    const memberPasswordSession = await issueRefreshToken(String(members.creator.user._id));
    const memberSsoSession = await issueRefreshToken(String(members.creator.user._id), undefined, { authMethod: 'sso', ssoConnectionId: conn });

    // An SSO session through a different connection doesn't prove this one.
    assert.strictEqual((await patchSso(ssoToken(owner, connectionId()), orgId, { ssoEnforced: true })).status, 403);

    const res = await patchSso(ssoToken(owner, conn), orgId, { ssoEnforced: true });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.organization.ssoEnforced, true);
    assert.ok(res.body.revokedSessions >= 1);

    assert.strictEqual(await consumeRefreshToken(memberPasswordSession), null, 'password session revoked');
    assert.ok(await consumeRefreshToken(memberSsoSession), 'SSO session kept');

    await new Promise((r) => setTimeout(r, 50));
    assert.ok(await AuditLog.exists({ action: 'organization.sso.enforce', workspace: workspace._id, targetResourceId: String(orgId) }));

    const off = await patchSso(ssoToken(owner, conn), orgId, { ssoEnforced: false });
    assert.strictEqual(off.status, 200);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(await AuditLog.exists({ action: 'organization.sso.unenforce', workspace: workspace._id }));
    assert.strictEqual((await login(members.viewer)).status, 200, 'password login works again');
  });

  it('refuses to enforce while the deployment has SSO off, and a connection can belong to one org only', async () => {
    const first = await makeOrg();
    const second = await makeOrg();
    const conn = connectionId();
    await Organization.updateOne({ _id: first.orgId }, { $set: { ssoConnectionId: conn } });

    assert.strictEqual((await patchSso(second.owner.token, second.orgId, { ssoConnectionId: conn })).status, 409);

    env.SSO_ENABLED = false;
    const res = await patchSso(ssoToken(first.owner, conn), first.orgId, { ssoEnforced: true });
    assert.strictEqual(res.status, 409);
  });
});

describe('SSO sign-in is bound to linked connections', () => {
  it('refuses an existing account through a connection not linked to it', async () => {
    const { members } = await makeOrg();
    await assert.rejects(
      provisionUserFromProfile({ email: members.viewer.user.email, connection_id: connectionId() }),
      SsoNotLinkedError
    );
  });

  it('signs in an existing member through their org’s connection', async () => {
    const { members, orgId } = await makeOrg();
    const conn = connectionId();
    await Organization.updateOne({ _id: orgId }, { $set: { ssoConnectionId: conn } });
    const user = await provisionUserFromProfile({ email: members.viewer.user.email.toUpperCase(), connection_id: conn });
    assert.strictEqual(String(user._id), String(members.viewer.user._id));
  });

  it('creates a new account on first sign-in, and only its connection signs it in again', async () => {
    const conn = connectionId();
    const email = `jit-${suffix()}@sso-example.com`;
    const first = await provisionUserFromProfile({ email, connection_id: conn, first_name: 'Jit' });
    created.push(first);
    assert.strictEqual(first.ssoConnectionId, conn);

    const again = await provisionUserFromProfile({ email, connection_id: conn });
    assert.strictEqual(String(again._id), String(first._id));
    await assert.rejects(provisionUserFromProfile({ email, connection_id: connectionId() }), SsoNotLinkedError);
  });
});
