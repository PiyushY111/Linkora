import express from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getAuthorizationUrl, exchangeCodeForProfile, provisionUserFromProfile } from '../services/ssoService.js';
import { generateToken, issueRefreshToken } from '../utils/jwt.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

function requireSsoEnabled(req, res, next) {
  if (!env.SSO_ENABLED) {
    return res.status(501).json({ success: false, message: 'SSO is not enabled on this deployment' });
  }
  next();
}

router.get('/authorize', requireSsoEnabled, (req, res) => {
  const { organizationId, connectionId } = req.query;
  const state = crypto.randomBytes(16).toString('hex');
  const url = getAuthorizationUrl({ organizationId, connectionId, state });
  res.redirect(url);
});

router.get('/callback', requireSsoEnabled, async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Missing authorization code' });
  }

  try {
    const profile = await exchangeCodeForProfile(code);
    const user = await provisionUserFromProfile(profile);

    const token = generateToken(user._id);
    const refreshToken = await issueRefreshToken(String(user._id));

    logAudit({ action: 'auth.sso.login', actorUserId: user._id, ipAddress: req.ip });

    const redirectUrl = new URL('/sso/callback', env.FRONTEND_URL);
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('refreshToken', refreshToken);
    res.redirect(redirectUrl.toString());
  } catch (err) {
    logger.error({ err }, 'SSO callback failed');
    res.status(502).json({ success: false, message: 'SSO authentication failed' });
  }
});

export default router;
