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
  const isProd = env.NODE_ENV === 'production';
  const defaultSameSite = isProd ? 'none' : env.NODE_ENV === 'development' ? 'lax' : 'strict';
  const sameSite = env.COOKIE_SAMESITE || defaultSameSite;
  const secure = env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE : isProd;
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: REFRESH_COOKIE_PATH,
    maxAge: env.JWT_REFRESH_TOKEN_TTL_SECONDS * 1000,
    ...(isProd && sameSite === 'none' ? { partitioned: true } : {}),
  });
}

export function clearRefreshTokenCookie(res) {
  const isProd = env.NODE_ENV === 'production';
  const defaultSameSite = isProd ? 'none' : env.NODE_ENV === 'development' ? 'lax' : 'strict';
  const sameSite = env.COOKIE_SAMESITE || defaultSameSite;
  const secure = env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE : isProd;
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite,
    path: REFRESH_COOKIE_PATH,
    ...(isProd && sameSite === 'none' ? { partitioned: true } : {}),
  });
}

export const REFRESH_COOKIE = { name: REFRESH_COOKIE_NAME, path: REFRESH_COOKIE_PATH };
