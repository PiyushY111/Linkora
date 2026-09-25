const DEFAULT_AFTER_AUTH = '/dashboard';

/**
 * Where to go after login/register. Pages that need auth first (e.g. an
 * invite link) pass their own path as router state `{ from }`; it's kept in
 * history state rather than a ?next= query so tokens in that path never
 * reach a URL, a server log or a Referer. Anything that isn't a same-site
 * path (absolute URL, protocol-relative //host, backslash tricks) falls back
 * to the dashboard.
 * @param {unknown} from
 * @returns {string}
 */
export function safeRedirectPath(from) {
  if (typeof from !== 'string' || !from.startsWith('/')) return DEFAULT_AFTER_AUTH;
  if (from.startsWith('//') || from.includes('\\')) return DEFAULT_AFTER_AUTH;
  return from;
}

export default safeRedirectPath;
