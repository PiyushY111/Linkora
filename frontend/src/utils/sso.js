/**
 * Messages for the `?error=` codes the SSO callback (and a refused token
 * refresh) send the browser back to /login with.
 */
export const SSO_ERROR_MESSAGES = {
  sso_failed: 'Single sign-on didn’t complete. Please try again.',
  sso_not_linked:
    'That single sign-on connection isn’t linked to this account. Sign in the usual way, or ask your admin which organization to use.',
  sso_required: 'Your organization requires single sign-on. Sign in with SSO to continue.',
};

/**
 * Whether a server-provided SSO URL is safe to send the browser to: https
 * only, so a malformed value can never become a javascript: or data: URL.
 * @param {unknown} url
 */
export function isSafeSsoUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Sends the browser into the SSO flow, if the URL is safe. */
export function goToSso(url) {
  if (!isSafeSsoUrl(url)) return false;
  window.location.assign(url);
  return true;
}
