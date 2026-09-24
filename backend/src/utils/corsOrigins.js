import { env } from '../config/env.js';

/**
 * Returns a Set of explicitly allowed origins derived from FRONTEND_URL,
 * the ALLOWED_ORIGINS comma-separated list, and local development ports.
 *
 * Explicitly avoids wildcard suffixes (*.vercel.app) to prevent any
 * arbitrary site deployed to Vercel's public domain from issuing credentialed
 * cross-origin requests.
 */
export function getAllowedOrigins() {
  const allowed = new Set();

  if (env.FRONTEND_URL) {
    try {
      allowed.add(new URL(env.FRONTEND_URL).origin);
    } catch {}
  }

  if (env.ALLOWED_ORIGINS) {
    env.ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((originStr) => {
        try {
          allowed.add(new URL(originStr).origin);
        } catch {
          allowed.add(originStr.replace(/\/+$/, ''));
        }
      });
  }

  // Local development fallbacks
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    allowed.add('http://localhost:3000');
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:3000');
    allowed.add('http://127.0.0.1:5173');
  }

  return allowed;
}

/**
 * Validates whether an incoming Origin header is permitted.
 * @param {string|undefined|null} origin
 * @returns {boolean}
 */
export function isAllowedOrigin(origin) {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  try {
    const parsed = new URL(origin).origin;
    return allowed.has(parsed);
  } catch {
    return false;
  }
}
