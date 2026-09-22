import crypto from 'crypto';
import { env } from '../config/env.js';
import User from '../models/User.js';

/**
 * Enterprise SSO via WorkOS (SAML 2.0 / OIDC — Okta, Azure AD, Google
 * Workspace, etc.). Talks to WorkOS's REST API directly with `fetch`
 * rather than the @workos-inc/node SDK: there's no real WorkOS account
 * available to exercise this against here, so pulling in an SDK that can't
 * be verified isn't worth the added dependency surface. Swapping to the
 * SDK later is a drop-in change if desired.
 */

const WORKOS_API_BASE = 'https://api.workos.com';

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
 * Finds or creates a local User for an SSO profile. SSO-provisioned users
 * get a random unusable local password (they only ever authenticate via
 * the IdP) and are marked verified.
 * @param {{ email: string, first_name?: string, last_name?: string }} profile
 */
export async function provisionUserFromProfile(profile) {
  let user = await User.findOne({ email: profile.email });
  if (user) return user;

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;
  user = await User.create({
    name,
    email: profile.email,
    password: crypto.randomBytes(32).toString('hex'), // unusable local password
    isVerified: true,
  });
  return user;
}

export default { getAuthorizationUrl, exchangeCodeForProfile, provisionUserFromProfile };
