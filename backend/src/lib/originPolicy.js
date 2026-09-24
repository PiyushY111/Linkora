/**
 * The single rule for which browser origins may make credentialed requests
 * to this API. CORS (app.js) and the CSRF origin check (middleware/csrf.js)
 * both use it, so the two can never disagree.
 *
 * An origin is allowed only if it exactly matches FRONTEND_URL's origin or
 * an entry in ALLOWED_ORIGINS. There is no suffix or wildcard matching: a
 * pattern like "*.vercel.app" would trust every app anyone deploys there.
 * Outside production, http://localhost:<port> and http://127.0.0.1:<port>
 * are also allowed for local development.
 */

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Parses a comma-separated ALLOWED_ORIGINS value into normalised origins.
 * Throws on anything that is not a bare http(s) origin (no path, no
 * wildcard), so a typo fails at boot instead of silently trusting nothing
 * or too much.
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function parseAllowedOrigins(value) {
  if (!value || !value.trim()) return [];

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes('*')) {
        throw new Error(`Wildcards are not allowed in ALLOWED_ORIGINS: "${entry}"`);
      }
      let url;
      try {
        url = new URL(entry);
      } catch {
        throw new Error(`Not a valid origin in ALLOWED_ORIGINS: "${entry}"`);
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`ALLOWED_ORIGINS entries must be http(s): "${entry}"`);
      }
      if (url.origin !== entry.replace(/\/$/, '')) {
        throw new Error(`ALLOWED_ORIGINS entries must be bare origins with no path: "${entry}"`);
      }
      return url.origin;
    });
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isLocalDevOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && LOCAL_DEV_HOSTS.has(url.hostname) && url.origin === origin;
  } catch {
    return false;
  }
}

/**
 * @param {{ frontendUrl: string, allowedOrigins: string[], nodeEnv: string }} config
 * @returns {(origin: string | undefined | null) => boolean}
 */
export function createOriginPolicy({ frontendUrl, allowedOrigins, nodeEnv }) {
  const allowed = new Set([originOf(frontendUrl), ...allowedOrigins].filter(Boolean));
  const allowLocalDev = nodeEnv !== 'production';

  return function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (allowed.has(origin)) return true;
    return allowLocalDev && isLocalDevOrigin(origin);
  };
}

