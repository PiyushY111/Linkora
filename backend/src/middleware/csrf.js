import { env } from '../config/env.js';
import { ForbiddenError } from '../lib/errors.js';

/**
 * Origin-check CSRF guard for cookie-authenticated, state-changing routes
 * (refresh token rotation, logout). SameSite=Strict on the refresh cookie
 * already blocks the browser from attaching it to a cross-site request in
 * virtually all cases; this is defense-in-depth for older/misconfigured
 * clients and proxies that might not honor SameSite.
 *
 * A request with no Origin/Referer at all (plain server-to-server or a
 * non-browser client) is allowed through — the cookie's SameSite attribute
 * is the primary defense there, since only a browser can be tricked into a
 * forged cross-site request in the first place.
 */
export function verifyOriginForCsrf(req, res, next) {
  const origin = req.headers.origin || refererOrigin(req.headers.referer);
  if (!origin) return next();

  let allowed = null;
  try {
    allowed = new URL(env.FRONTEND_URL).origin;
  } catch {
    allowed = null;
  }

  const isVercel = origin.endsWith('.vercel.app') || (allowed && origin === allowed) || origin === 'http://localhost:3000';
  if (!isVercel) {
    throw new ForbiddenError('Cross-origin request rejected');
  }

  next();
}

function refererOrigin(referer) {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export default verifyOriginForCsrf;
