import express from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getAuthorizationUrl, exchangeCodeForProfile, provisionUserFromProfile } from '../services/ssoService.js';
import { issueRefreshToken } from '../utils/jwt.js';
import { logAudit } from '../utils/auditLogger.js';
import { redis } from '../services/cacheService.js';
import { setRefreshTokenCookie } from '../utils/authCookies.js';
import { ValidationError, UnauthorizedError } from '../lib/errors.js';

const router = express.Router();

const SSO_STATE_TTL_SECONDS = 10 * 60;
const ssoStateKey = (state) => `sso:state:${state}`;

function requireSsoEnabled(req, res, next) {
  if (!env.SSO_ENABLED) {
    return res.status(501).json({ success: false, message: 'SSO is not enabled on this deployment' });
  }
  next();
}

router.get('/authorize', requireSsoEnabled, async (req, res) => {
  const { organizationId, connectionId } = req.query;
  const state = crypto.randomBytes(16).toString('hex');

  // Bind this state to this authorization attempt so the callback can
  // reject a forged or replayed `state` (CSRF on the OAuth/SAML dance).
  await redis.set(ssoStateKey(state), '1', 'EX', SSO_STATE_TTL_SECONDS);

  const url = getAuthorizationUrl({ organizationId, connectionId, state });
  res.redirect(url);
});

router.get('/callback', requireSsoEnabled, async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    throw new ValidationError('Missing authorization code');
  }
  if (!state) {
    throw new ValidationError('Missing state parameter');
  }

  // Atomic check-and-consume: a state can only ever complete one callback.
  const validState = await redis.getdel(ssoStateKey(state));
  if (!validState) {
    throw new UnauthorizedError('Invalid or expired SSO state');
  }

  try {
    const profile = await exchangeCodeForProfile(code);
    const user = await provisionUserFromProfile(profile);

    const refreshToken = await issueRefreshToken(String(user._id));
    setRefreshTokenCookie(res, refreshToken);

    logAudit({ action: 'auth.sso.login', actorUserId: user._id, ipAddress: req.ip });

    // No tokens travel in the URL: the refresh token is now an httpOnly
    // cookie, and the SPA exchanges it for an access token via
    // POST /api/auth/refresh on load (see frontend bootstrapSession).
    res.redirect(env.FRONTEND_URL);
  } catch (err) {
    logger.error({ err }, 'SSO callback failed');
    res.redirect(`${env.FRONTEND_URL}/login?error=sso_failed`);
  }
});

export default router;
