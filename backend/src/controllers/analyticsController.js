import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import Link from '../models/Link.js';
import { getClientIp, getUserAgent } from '../utils/helpers.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { calculateTimeRange } from '../services/analyticsTimeRange.js';
import { getAnalyticsRepository } from '../repositories/analytics/analyticsRepository.js';
import { getLinkMeta, setLinkMeta, setNegativeCache, invalidateLinkMetaForLink, checkAndIncrementUsage, getCurrentUsage, buildLinkMetaFromDoc, getRedis } from '../services/cacheService.js';
import { emitClickEvent } from '../services/eventStreamService.js';
import { dispatchEvent } from '../services/webhookService.js';
import { detectBot } from '../utils/botDetector.js';
import { calculateAbTestStatistics } from '../services/statisticsService.js';
import { NotFoundError, ValidationError, UnauthorizedError } from '../lib/errors.js';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

/**
 * Only bcrypt hashes are accepted for link passwords — see
 * scripts/migrate-plaintext-link-passwords.js for the one-off migration
 * that hashed any pre-existing plaintext values. A link whose stored
 * `password` somehow isn't a bcrypt hash is treated as unverifiable rather
 * than falling back to a plaintext comparison.
 */
function isBcryptHash(value) {
  return typeof value === 'string' && BCRYPT_HASH_PATTERN.test(value);
}

const UNLOCK_TOKEN_AUDIENCE = 'link-unlock';
const UNLOCK_TOKEN_TTL_SECONDS = 60;
const unlockConsumedKey = (jti) => `link:unlock:${jti}`;

/**
 * Verifies a link password (bcrypt only) and, on success, issues a
 * short-lived (60s), single-use, signed token bound to this shortCode. The
 * password itself never has to travel again after this call — the caller
 * exchanges this token for the actual redirect instead of resending ?pwd=.
 */
async function verifyPasswordAndIssueUnlockToken(storedPasswordHash, providedPassword, shortCode) {
  if (!providedPassword || !isBcryptHash(storedPasswordHash)) return null;

  const ok = await bcrypt.compare(providedPassword, storedPasswordHash);
  if (!ok) return null;

  const jti = crypto.randomBytes(16).toString('hex');
  await getRedis().set(unlockConsumedKey(jti), '1', 'EX', UNLOCK_TOKEN_TTL_SECONDS);

  return jwt.sign({ shortCode, jti }, env.JWT_SECRET, {
    expiresIn: UNLOCK_TOKEN_TTL_SECONDS,
    audience: UNLOCK_TOKEN_AUDIENCE,
  });
}

/**
 * Redeems an unlock token: verifies its signature/expiry/audience, confirms
 * it was minted for *this* shortCode, and atomically consumes it so it
 * cannot be replayed for a second redirect.
 * @returns {Promise<boolean>}
 */
async function redeemUnlockToken(token, shortCode) {
  if (!token) return false;

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { audience: UNLOCK_TOKEN_AUDIENCE });
  } catch {
    return false;
  }

  if (payload.shortCode !== shortCode || !payload.jti) return false;

  const consumed = await getRedis().getdel(unlockConsumedKey(payload.jti));
  return Boolean(consumed);
}

/**
 * Resolves just the stored password hash for a short code, via the same
 * cache-then-Mongo path the redirect uses. Returns `null` if the code
 * doesn't resolve to any link at all, or `''` if it resolves but isn't
 * password-protected.
 */
async function getPasswordHashForShortCode(shortCode) {
  const cached = await getLinkMeta(shortCode);
  if (cached.status === 'hit') return cached.meta.passwordHash || '';
  if (cached.status === 'negative') return null;

  const link = await Link.findOne({ $or: [{ shortCode }, { customAlias: shortCode }] })
    .read('nearest')
    .lean();

  if (!link) {
    setNegativeCache(shortCode).catch((err) => logger.error({ err, shortCode }, 'Failed to set negative cache'));
    return null;
  }

  return link.password || '';
}

/**
 * POST /api/r/:shortCode/unlock
 * Verifies a link password out-of-band from the redirect itself and, on
 * success, returns a short-lived single-use token the client then passes to
 * the redirect instead of the raw password — so the password never has to
 * appear in a URL, and therefore never lands in access logs, browser
 * history, or a Referer header.
 */
export const unlockLink = async (req, res) => {
  const shortCode = (req.params.shortCode || '').trim();
  const { password } = req.body;

  if (!shortCode) {
    throw new NotFoundError('Link not found');
  }
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required');
  }

  const passwordHash = await getPasswordHashForShortCode(shortCode);
  if (passwordHash === null) {
    throw new NotFoundError('Link not found');
  }
  if (!passwordHash) {
    throw new ValidationError('This link is not password protected');
  }

  const unlockToken = await verifyPasswordAndIssueUnlockToken(passwordHash, password, shortCode);
  if (!unlockToken) {
    throw new UnauthorizedError('Incorrect password');
  }

  res.status(200).json({ success: true, unlockToken, expiresIn: UNLOCK_TOKEN_TTL_SECONDS });
};

/**
 * Redirects a short code to its destination URL.
 *
 * Hot path: Redis read-through cache only, zero synchronous MongoDB writes.
 * On a cache miss, MongoDB is read once (read preference "nearest") and the
 * cache is repopulated; on a Mongo miss a negative cache entry is written to
 * prevent cache penetration. The response is sent first; click-count and
 * click-event recording happen after, without being awaited.
 */
export const redirectLink = async (req, res) => {
  // Case-sensitive on purpose — see the comment on Link.shortCode.
  const shortCode = (req.params.shortCode || '').trim();
  const { unlockToken } = req.query;
  const ua = getUserAgent(req);
  const clientIp = getClientIp(req);
  const botInfo = detectBot(ua);

  if (!shortCode) {
    return res.status(404).json({ success: false, message: 'Link not found' });
  }

  const cached = await getLinkMeta(shortCode);

  if (cached.status === 'negative') {
    return res.status(404).json({ success: false, message: 'Link not found' });
  }

  // XFetch probabilistic early expiration: refresh the cache in the background
  if (cached.status === 'hit' && cached.shouldRecomputeEarly) {
    const fetchStart = Date.now();
    Link.findOne({ $or: [{ shortCode }, { customAlias: shortCode }] })
      .read('nearest')
      .lean()
      .then((fresh) => {
        if (fresh) {
          const computeDelta = Date.now() - fetchStart;
          setLinkMeta(shortCode, { ...buildLinkMetaFromDoc(fresh), computeDelta }).catch(() => {});
        }
      })
      .catch((err) => logger.warn({ err, shortCode }, 'Background XFetch refresh failed'));
  }

  let meta = cached.status === 'hit' ? cached.meta : null;

  if (!meta) {
    const fetchStart = Date.now();
    const link = await Link.findOne({
      $or: [{ shortCode }, { customAlias: shortCode }],
    })
      .read('nearest')
      .lean();
    const computeDelta = Date.now() - fetchStart;

    if (!link) {
      setNegativeCache(shortCode).catch((err) => logger.error({ err, shortCode }, 'Failed to set negative cache'));
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    meta = buildLinkMetaFromDoc(link);

    // computeDelta is XFetch's Δ (the real cost of a cache-miss recompute,
    // measured here rather than a hardcoded guess) — it drives how
    // aggressively getLinkMeta() schedules an early background refresh.
    setLinkMeta(shortCode, { ...meta, computeDelta }).catch((err) =>
      logger.error({ err, shortCode }, 'Failed to populate link cache')
    );
  }

  if (!meta.isActive) {
    if (meta.expiredRedirectUrl) {
      return res.redirect(307, meta.expiredRedirectUrl);
    }
    const isLimit = meta.maxClicks && meta.maxClicks > 0;
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect(302, `${env.FRONTEND_URL}/${shortCode}${isLimit ? '?limit=1' : ''}`);
    }
    return res.status(410).json({
      success: false,
      limitReached: isLimit,
      message: isLimit
        ? 'This link has reached its maximum allowed number of clicks'
        : 'Link has been disabled',
    });
  }

  if (meta.expiryDate && Date.now() > meta.expiryDate) {
    if (meta.expiredRedirectUrl) {
      return res.redirect(307, meta.expiredRedirectUrl);
    }
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect(302, `${env.FRONTEND_URL}/${shortCode}?expired=1`);
    }
    return res.status(410).json({ success: false, expired: true, message: 'Link has expired' });
  }

  // Password check runs before any usage/click-limit consumption below: a
  // wrong-password (or missing-token) request must never spend one of the
  // link's limited maxClicks. Probe requests never consume usage either way.
  if (meta.passwordHash) {
    const unlocked = await redeemUnlockToken(unlockToken, shortCode);
    if (!unlocked) {
      if (req.headers.accept?.includes('text/html') && !unlockToken) {
        return res.redirect(302, `${env.FRONTEND_URL}/${shortCode}`);
      }
      return res.status(403).json({
        success: false,
        requiresPassword: true,
        message: unlockToken
          ? 'Unlock token is invalid, expired, or already used'
          : 'Password required to access this link',
      });
    }
  }

  // Enforce Click / Usage Limit if configured
  if (meta.maxClicks && meta.maxClicks > 0) {
    const isProbe = req.query.probe === '1';
    if (isProbe) {
      const current = await getCurrentUsage(meta.linkId);
      if (current >= meta.maxClicks) {
        return res.status(410).json({
          success: false,
          limitReached: true,
          message: 'This link has reached its maximum allowed number of clicks',
        });
      }
    } else {
      const usage = await checkAndIncrementUsage(meta.linkId, meta.maxClicks, meta.clicks);
      if (!usage.allowed) {
        if (meta.expiredRedirectUrl) {
          return res.redirect(307, meta.expiredRedirectUrl);
        }
        if (req.headers.accept?.includes('text/html')) {
          return res.redirect(302, `${env.FRONTEND_URL}/${shortCode}?limit=1`);
        }
        return res.status(410).json({
          success: false,
          limitReached: true,
          message: 'This link has reached its maximum allowed number of clicks',
        });
      }

      if (usage.reached) {
        // Link has just served its final allowable click; disable in DB & invalidate cache asynchronously
        Link.findByIdAndUpdate(meta.linkId, { isActive: false }).catch((err) =>
          logger.error({ err, linkId: meta.linkId }, 'Failed to auto-disable link after reaching maxClicks')
        );
        // `meta` carries both shortCode and customAlias (buildLinkMetaFromDoc),
        // so both cache keys clear even if this request came in through
        // whichever one of the two ISN'T `shortCode` here.
        invalidateLinkMetaForLink(meta).catch((err) =>
          logger.error({ err, shortCode }, 'Failed to invalidate link meta after reaching maxClicks')
        );
        dispatchEvent(meta.userId, 'link.limit_reached', {
          linkId: meta.linkId,
          shortCode,
          originalUrl: meta.originalUrl,
          maxClicks: meta.maxClicks,
          totalClicks: usage.current,
        }).catch((err) =>
          logger.error({ err, linkId: meta.linkId }, 'Failed to dispatch link.limit_reached webhook')
        );
      }
    }
  }

  // Social crawlers (Slack, Twitter, Discord, iMessage, ...) get an OpenGraph preview page
  if (botInfo.isSocialCrawler && req.query.probe !== '1') {
    const title = meta.ogTitle || shortCode;
    const description = meta.ogDescription || 'Shortened link by Linkora';
    const image = meta.ogImage || '';
    const dest = meta.originalUrl;

    const escapeHtml = (str) =>
      String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
  <meta property="og:url" content="${escapeHtml(dest)}" />
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}
  <meta http-equiv="refresh" content="0;url=${escapeHtml(dest)}" />
</head>
<body style="font-family: system-ui, sans-serif; background: #0A0A0B; color: #F5F5F7; padding: 2rem;">
  <p>Redirecting to <a href="${escapeHtml(dest)}" style="color: #C6FF3D;">${escapeHtml(dest)}</a>...</p>
</body>
</html>`;

    // Defense-in-depth: every interpolated value above is HTML-escaped, but
    // this response still carries user-supplied og:title/og:description/
    // og:image content, so it gets its own strict CSP rather than relying
    // solely on escaping — no scripts, no framing, styles inline-only.
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'none'"],
        imgSrc: ['*'],
        styleSrc: ["'unsafe-inline'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    })(req, res, () => {});

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);

    // Emit crawler click tagged as bot without incrementing user usage limit
    emitClickEvent({
      linkId: meta.linkId,
      shortCode,
      userId: meta.userId,
      destinationUrl: dest,
      ip: clientIp,
      ua,
      referer: req.headers.referer || 'social-preview',
      timestamp: Date.now(),
      isBot: true,
      botName: botInfo.botName,
    });
    return;
  }

  // A/B split with sticky routing, otherwise device targeting
  let destinationUrl = meta.originalUrl;
  let variantId = null;
  let variantName = null;

  if (meta.routingType === 'ab_test' && Array.isArray(meta.variants) && meta.variants.length > 0) {
    // Deterministic Sticky Session Hashing: (Client IP + UA) -> bucket [0..99]
    const seed = `${clientIp}-${ua.slice(0, 50)}`;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = Math.abs(hash) % 100;

    let cumulative = 0;
    let selected = meta.variants[0];
    for (const v of meta.variants) {
      cumulative += Number(v.weight) || 0;
      if (bucket < cumulative) {
        selected = v;
        break;
      }
    }

    destinationUrl = selected.url;
    variantId = selected.id;
    variantName = selected.name;

    // Increment variant clicks asynchronously in MongoDB
    Link.updateOne(
      { _id: meta.linkId, 'variants.id': selected.id },
      { $inc: { 'variants.$.clicks': 1 } }
    ).catch((err) => logger.warn({ err, linkId: meta.linkId }, 'Failed to bump variant clicks'));
  } else {
    // Standard device targeting
    if (/iphone|ipad|ipod/i.test(ua) && meta.iosRedirect) {
      destinationUrl = meta.iosRedirect;
    } else if (/android/i.test(ua) && meta.androidRedirect) {
      destinationUrl = meta.androidRedirect;
    }
  }

  if (req.query.probe === '1') {
    return res.status(200).json({ success: true, originalUrl: destinationUrl, variantId, variantName });
  }

  // no-store, not a short max-age: this is a tracked link, and any browser
  // or intermediary cache serving a stale 307 from cache means that click
  // never reaches emitClickEvent below at all.
  res.set('Cache-Control', 'no-store');
  res.redirect(307, destinationUrl);

  // Fire-and-forget: never await Mongo writes or streaming on the hot path.
  // Link.clicks itself is incremented by the stream consumer as part of
  // processing this same event (see consumers/clickConsumer.js) — there is
  // no separate Redis click-counter path to keep in sync with it anymore.
  emitClickEvent({
    linkId: meta.linkId,
    shortCode,
    userId: meta.userId,
    destinationUrl,
    ip: clientIp,
    ua,
    referer: req.headers.referer || 'direct',
    timestamp: Date.now(),
    utmSource: req.query.utm_source,
    utmMedium: req.query.utm_medium,
    utmCampaign: req.query.utm_campaign,
    variantId,
    variantName,
    isBot: botInfo.isBot,
    botName: botInfo.botName,
  });
};

const EXPORT_ROW_LIMIT = 10000;

// Get analytics for a specific link
export const getLinkAnalytics = async (req, res) => {
  const { linkId } = req.params;
  const timeInfo = calculateTimeRange(req.query.timeRange, req.query.startDate, req.query.endDate);

  // Ownership enforced in the query itself, not fetched-then-compared.
  const link = await Link.findOne({ _id: linkId, user: req.user.id }).lean();
  if (!link) {
    throw new NotFoundError('Link not found');
  }

  const result = await getAnalyticsRepository().getLinkAnalytics(String(link._id), timeInfo, {
    excludeBots: req.query.excludeBots === 'true',
  });

  res.status(200).json({
    success: true,
    routingType: link.routingType || 'direct',
    abTestAnalysis: link.routingType === 'ab_test' ? calculateAbTestStatistics(link.variants || []) : null,
    ...result,
  });
};

// Get aggregated analytics summary across all of the user's links
export const getAnalyticsSummary = async (req, res) => {
  const timeInfo = calculateTimeRange(req.query.timeRange, req.query.startDate, req.query.endDate);
  const summary = await getAnalyticsRepository().getUserSummary(req.user.id, timeInfo);
  res.status(200).json({ success: true, summary });
};

/**
 * Quotes a CSV cell and neutralises spreadsheet formulas: UTM values and
 * cities are visitor-controlled, and a cell starting with = + - @ would be
 * executed by Excel/Sheets when the owner opens the export.
 */
function csvCell(value) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS = [
  ['Event ID', 'eventId'],
  ['Timestamp (UTC)', 'timestamp'],
  ['Short Code', 'shortCode'],
  ['IP Address', 'ip'],
  ['Country', 'country'],
  ['City', 'city'],
  ['Device', 'device'],
  ['Browser', 'browser'],
  ['OS', 'os'],
  ['Referrer', 'referrerDomain'],
  ['UTM Source', 'utmSource'],
  ['UTM Medium', 'utmMedium'],
  ['UTM Campaign', 'utmCampaign'],
];

// Export raw click events as a downloadable CSV
export const exportAnalytics = async (req, res) => {
  const { linkId, timeRange, startDate, endDate } = req.query;
  const timeInfo = calculateTimeRange(timeRange, startDate, endDate);
  const scopedToLink = linkId && linkId !== 'all';

  if (scopedToLink) {
    // Ownership enforced in the query itself, not fetched-then-compared.
    const link = await Link.exists({ _id: linkId, user: req.user.id });
    if (!link) {
      throw new NotFoundError('Link not found');
    }
  }

  const rows = getAnalyticsRepository().exportEvents({
    linkId: scopedToLink ? linkId : undefined,
    userId: req.user.id,
    start: timeInfo.start,
    end: timeInfo.end,
    limit: EXPORT_ROW_LIMIT,
  });

  const filename = `linkora-analytics-${scopedToLink ? linkId : 'all'}-${timeInfo.timeRange}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write(`${CSV_COLUMNS.map(([header]) => header).join(',')}\n`);

  try {
    for await (const row of rows) {
      res.write(`${CSV_COLUMNS.map(([, field]) => csvCell(row[field])).join(',')}\n`);
    }
  } catch (err) {
    // Headers are already sent, so the error handler can't send a status;
    // log it and cut the response short rather than end it as if complete.
    logger.error({ err }, 'exportAnalytics failed mid-stream');
    res.destroy(err);
    return;
  }
  res.end();
};
