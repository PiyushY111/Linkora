import crypto from 'crypto';
import { env } from '../config/env.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Workspace from '../models/Workspace.js';
import { resolveActiveWorkspace } from './workspaceService.js';
import { getRedis } from './cacheService.js';

/**
 * Enterprise SSO via WorkOS (SAML 2.0 / OIDC — Okta, Azure AD, Google
 * Workspace, etc.). Talks to WorkOS's REST API directly with `fetch`
 * rather than the @workos-inc/node SDK: there's no real WorkOS account
 * available to exercise this against here, so pulling in an SDK that can't
 * be verified isn't worth the added dependency surface. Swapping to the
 * SDK later is a drop-in change if desired.
 */

const WORKOS_API_BASE = 'https://api.workos.com';
const SSO_STATE_TTL_SECONDS = 10 * 60;
const ssoStateKey = (state) => `sso:state:${state}`;

/** An SSO sign-in that isn't allowed to reach the account it names. */
export class SsoNotLinkedError extends Error {
  constructor(message = 'This SSO connection is not linked to that account') {
    super(message);
    this.name = 'SsoNotLinkedError';
  }
}

/**
 * @param {{ organizationId?: string, connectionId?: string, state: string }} params
 */
export function getAuthorizationUrl({ organizationId, connectionId, state }) {
  const params = new URLSearchParams({
    client_id: env.WORKOS_CLIENT_ID,
    redirect_uri: env.WORKOS_REDIRECT_URI,
    response_type: 'code',
    state,
  });
  if (organizationId) params.set('organization', organizationId);
  if (connectionId) params.set('connection', connectionId);

  return `${WORKOS_API_BASE}/sso/authorize?${params.toString()}`;
}

/**
 * Starts an SSO sign-in: mints a single-use `state` (bound in Redis, checked
 * and consumed by the callback, so a forged or replayed callback is
 * rejected) and returns the WorkOS authorize URL to send the browser to.
 * @param {{ organizationId?: string, connectionId?: string }} target
 * @returns {Promise<string>}
 */
export async function createAuthorizationRequest({ organizationId, connectionId } = {}) {
  const state = crypto.randomBytes(16).toString('hex');
  await getRedis().set(ssoStateKey(state), '1', 'EX', SSO_STATE_TTL_SECONDS);
  return getAuthorizationUrl({ organizationId, connectionId, state });
}

/**
 * Atomically consumes a callback `state`; true only the first time for a
 * state createAuthorizationRequest minted.
 * @param {string} state
 */
export async function consumeAuthorizationState(state) {
  return Boolean(await getRedis().getdel(ssoStateKey(state)));
}

/** Organizations with a workspace the user is a member of, oldest membership first. */
async function organizationsOf(userId) {
  const workspaces = await Workspace.find({ 'members.user': userId }).sort({ createdAt: 1 }).select('organization').lean();
  const orderedIds = [...new Set(workspaces.map((w) => String(w.organization)))];
  const orgs = await Organization.find({ _id: { $in: orderedIds } }).lean();
  const byId = new Map(orgs.map((o) => [String(o._id), o]));
  return orderedIds.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * The first organization (by membership age) that requires this user to
 * sign in with SSO, or null. Any org they belong to counts, not only the
 * active workspace's, so switching workspaces can't sidestep enforcement.
 * @returns {Promise<object | null>}
 */
export async function findEnforcingOrganization(userId) {
  return (await organizationsOf(userId)).find((org) => org.ssoEnforced && org.ssoConnectionId) ?? null;
}

/**
 * Connections allowed to sign this user in: those of orgs they belong to,
 * plus the one that created the account (JIT). Any other connection naming
 * their email is refused, so one tenant's identity provider can't take over
 * another tenant's (or a password) account.
 * @returns {Promise<Set<string>>}
 */
export async function linkedConnectionIds(user) {
  const ids = new Set((await organizationsOf(user._id)).map((o) => o.ssoConnectionId).filter(Boolean));
  if (user.ssoConnectionId) ids.add(user.ssoConnectionId);
  return ids;
}

/**
 * Exchanges an SSO authorization code for the authenticated user's profile.
 * @param {string} code
 */
export async function exchangeCodeForProfile(code) {
  const response = await fetch(`${WORKOS_API_BASE}/sso/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.WORKOS_CLIENT_ID,
      client_secret: env.WORKOS_API_KEY,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    throw new Error(`WorkOS token exchange failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.profile; // { id, email, first_name, last_name, connection_id, ... }
}

/**
 * Resolves the local User an SSO profile signs in as.
 *
 * - An existing account (matched by email) is only signed in if the
 *   profile's connection is linked to it (see linkedConnectionIds);
 *   otherwise SsoNotLinkedError.
 * - An unknown email gets a new account (just-in-time provisioning) with a
 *   random unusable local password, marked verified, remembering the
 *   connection that created it.
 * @param {{ email: string, connection_id: string, first_name?: string, last_name?: string }} profile
 */
export async function provisionUserFromProfile(profile) {
  const email = String(profile?.email || '').trim().toLowerCase();
  const connectionId = profile?.connection_id;
  if (!email || !connectionId) throw new SsoNotLinkedError('SSO profile is missing an email or connection');

  const existing = await User.findOne({ email });
  if (existing) {
    if (!(await linkedConnectionIds(existing)).has(connectionId)) throw new SsoNotLinkedError();
    return existing;
  }

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || email;
  const user = await User.create({
    name,
    email,
    password: crypto.randomBytes(32).toString('hex'), // unusable local password
    isVerified: true,
    ssoConnectionId: connectionId,
  });
  await resolveActiveWorkspace(user);
  return user;
}

export default {
  getAuthorizationUrl,
  createAuthorizationRequest,
  consumeAuthorizationState,
  exchangeCodeForProfile,
  findEnforcingOrganization,
  linkedConnectionIds,
  provisionUserFromProfile,
  SsoNotLinkedError,
};
