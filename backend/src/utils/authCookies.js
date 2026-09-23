import { env } from '../config/env.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';

/**
 * Sets the refresh token as an httpOnly, Secure, SameSite=Strict cookie
 * scoped to /api/auth. It is never readable from JavaScript and is never
 * sent to any other route, so an XSS payload elsewhere on the site cannot
 * read or exfiltrate it and CSRF exposure is limited to the auth endpoints.
 */
export function setRefreshTokenCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: env.JWT_REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearRefreshTokenCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}

export const REFRESH_COOKIE = { name: REFRESH_COOKIE_NAME, path: REFRESH_COOKIE_PATH };
