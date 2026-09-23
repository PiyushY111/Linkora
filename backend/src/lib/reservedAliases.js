/**
 * Aliases that would collide with a real dashboard/API route if allowed as
 * a custom short-link alias. The redirect route resolves a short code
 * against the same origin as the SPA and the public API, so e.g.
 * `customAlias: "login"` would make /login unreachable for everyone.
 */
export const RESERVED_ALIASES = new Set([
  'dashboard',
  'login',
  'register',
  'settings',
  'analytics',
  'webhooks',
  'developer',
  'qr-codes',
  'api',
  'admin',
  'health',
  'metrics',
  'workspaces',
  'sso',
  'logout',
  'auth',
  'public',
  'r',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'static',
  'assets',
]);

export function isReservedAlias(alias) {
  return RESERVED_ALIASES.has(String(alias || '').toLowerCase());
}

export default { RESERVED_ALIASES, isReservedAlias };
