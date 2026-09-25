import express from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  createAuthorizationRequest,
  consumeAuthorizationState,
  exchangeCodeForProfile,
  provisionUserFromProfile,
  SsoNotLinkedError,
} from '../services/ssoService.js';
import Organization from '../models/Organization.js';
import { issueRefreshToken } from '../utils/jwt.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { setRefreshTokenCookie } from '../utils/authCookies.js';
import { ValidationError, UnauthorizedError, NotFoundError } from '../lib/errors.js';
import { ssoStartRateLimiter } from '../middleware/rateLimiter.js';
import { verifyWorkOSSignature, handleDirectoryEvent } from '../services/directorySyncService.js';

const router = express.Router();

function requireSsoEnabled(req, res, next) {
  if (!env.SSO_ENABLED) {
    return res.status(501).json({ success: false, message: 'SSO is not enabled on this deployment' });
  }
  next();
}

router.get('/authorize', requireSsoEnabled, async (req, res) => {
  const { organizationId, connectionId } = req.query;
  // The state minted here binds this attempt, so the callback can reject a
  // forged or replayed `state` (CSRF on the OAuth/SAML dance).
  res.redirect(await createAuthorizationRequest({ organizationId, connectionId }));
});

/**
 * GET /start?org=<organization slug> — for "Sign in with SSO" on the login
 * page. Returns (rather than redirects to) the authorize URL for the org's
 * connection, so the SPA can show a clear error for an unknown org. Says
 * only whether an org slug has SSO set up, never anything about accounts.
 */
router.get('/start', requireSsoEnabled, ssoStartRateLimiter, async (req, res) => {
  const slug = typeof req.query.org === 'string' ? req.query.org.trim().toLowerCase() : '';
  if (!slug) throw new ValidationError('Organization is required');

  const org = await Organization.findOne({ slug, ssoConnectionId: { $type: 'string' } }).select('ssoConnectionId').lean();
  if (!org) throw new NotFoundError('No organization with single sign-on set up was found for that name');

  res.status(200).json({ success: true, url: await createAuthorizationRequest({ connectionId: org.ssoConnectionId }) });
});

/**
 * POST /scim/events — WorkOS Directory Sync (SCIM) webhook receiver.
 * Authenticated only by the WorkOS-Signature HMAC over the raw body (see
 * app.js), with a 5-minute replay window; handlers are idempotent because
 * WorkOS retries deliveries. Always 200 once verified and applied, including
 * for events it ignores, so WorkOS doesn't retry those forever.
 */
router.post('/scim/events', async (req, res) => {
  if (!env.WORKOS_WEBHOOK_SECRET) {
    return res.status(501).json({ success: false, message: 'Directory sync is not configured on this deployment' });
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!verifyWorkOSSignature(rawBody, req.headers['workos-signature'], env.WORKOS_WEBHOOK_SECRET)) {
    logger.warn({ ip: getClientIp(req) }, 'Rejected directory sync webhook with an invalid signature');
    throw new UnauthorizedError('Invalid webhook signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new ValidationError('Webhook body is not valid JSON');
  }

  const outcome = await handleDirectoryEvent(event);
  logger.info({ eventId: event.id, event: event.event, outcome }, 'Directory sync event handled');
  res.status(200).json({ success: true, outcome });
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
  if (!(await consumeAuthorizationState(state))) {
    throw new UnauthorizedError('Invalid or expired SSO state');
  }

  try {
    const profile = await exchangeCodeForProfile(code);
    const user = await provisionUserFromProfile(profile);

    // Recorded on the session: SSO enforcement and "prove SSO works before
    // enforcing it" check which connection a session signed in through.
    const refreshToken = await issueRefreshToken(String(user._id), undefined, {
      authMethod: 'sso',
      ssoConnectionId: profile.connection_id,
    });
    setRefreshTokenCookie(res, refreshToken);

    logAudit({
      action: 'auth.sso.login',
      actorUserId: user._id,
      ipAddress: getClientIp(req),
      diff: { connectionId: profile.connection_id },
    });

    // No tokens travel in the URL: the refresh token is now an httpOnly
    // cookie, and the SPA exchanges it for an access token via
    // POST /api/auth/refresh on load (see frontend bootstrapSession).
    res.redirect(env.FRONTEND_URL);
  } catch (err) {
    if (err instanceof SsoNotLinkedError) {
      logger.warn({ err: err.message }, 'SSO sign-in refused: connection not linked to the account');
      logAudit({ action: 'auth.sso.refused', ipAddress: getClientIp(req), diff: { reason: err.message } });
      return res.redirect(`${env.FRONTEND_URL}/login?error=sso_not_linked`);
    }
    logger.error({ err }, 'SSO callback failed');
    res.redirect(`${env.FRONTEND_URL}/login?error=sso_failed`);
  }
});

export default router;
