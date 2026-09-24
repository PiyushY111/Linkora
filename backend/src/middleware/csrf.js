import { isAllowedOrigin } from '../config/allowedOrigins.js';
import { ForbiddenError } from '../lib/errors.js';

/**
 * Origin-check CSRF guard for the cookie-authenticated, state-changing
 * routes (refresh-token rotation, logout). Uses the same allowlist as CORS
 * (config/allowedOrigins.js).
 *
 * In production the refresh cookie is SameSite=None so a frontend on a
 * different site can use it (utils/authCookies.js), which makes this check
 * the primary CSRF defence there, not just defence in depth.
 *
 * A request with neither Origin nor Referer is let through: browsers send
 * Origin on cross-site POSTs, so a missing one means a non-browser client,
 * which cannot be tricked into sending someone else's cookie.
 */
export function verifyOriginForCsrf(req, res, next) {
  const origin = req.headers.origin || refererOrigin(req.headers.referer);
  if (!origin) return next();

  if (!isAllowedOrigin(origin)) {
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
