import bcrypt from 'bcryptjs';
import Link from '../models/Link.js';
import Analytics from '../models/Analytics.js';
import ClickEvent from '../models/ClickEvent.js';
import { getClientIp, getUserAgent } from '../utils/helpers.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { runQuery } from '../config/clickhouse.js';
import {
  getLinkMeta,
  setLinkMeta,
  setNegativeCache,
  invalidateLinkMeta,
  incrementClickCounter,
  checkAndIncrementUsage,
  getCurrentUsage,
  seedLinkUsage,
} from '../services/cacheService.js';
import { emitClickEvent } from '../services/eventStreamService.js';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

/**
 * Verifies a link password against either a bcrypt hash or, for links not
 * yet migrated, the legacy plaintext value. On a successful plaintext match
 * it kicks off an async re-hash + cache invalidation (never awaited by the
 * caller) so the link is migrated to bcrypt on first successful use.
 */
function verifyLinkPassword(storedPassword, providedPwd, linkId, shortCode) {
  if (!providedPwd) return Promise.resolve(false);

  if (BCRYPT_HASH_PATTERN.test(storedPassword)) {
    return bcrypt.compare(providedPwd, storedPassword);
  }

  const matches = storedPassword === providedPwd;
  if (matches) {
    migrateLegacyPlaintextPassword(linkId, shortCode, providedPwd).catch((err) =>
      logger.error({ err, linkId }, 'Failed to migrate legacy plaintext link password')
    );
  }
  return Promise.resolve(matches);
}

async function migrateLegacyPlaintextPassword(linkId, shortCode, plaintext) {
  const hash = await bcrypt.hash(plaintext, 10);
  await Link.findByIdAndUpdate(linkId, { password: hash });
  await invalidateLinkMeta(shortCode);
}

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
  const { pwd } = req.query;

  if (!shortCode) {
    return res.status(404).json({ success: false, message: 'Link not found' });
  }

  const cached = await getLinkMeta(shortCode);

  if (cached.status === 'negative') {
    return res.status(404).json({ success: false, message: 'Link not found' });
  }

  let meta = cached.status === 'hit' ? cached.meta : null;

  if (!meta) {
    const link = await Link.findOne({
      $or: [{ shortCode }, { customAlias: shortCode }],
    })
      .read('nearest')
      .lean();

    if (!link) {
      setNegativeCache(shortCode).catch((err) => logger.error({ err, shortCode }, 'Failed to set negative cache'));
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    meta = {
      originalUrl: link.originalUrl,
      isActive: link.isActive,
      expiryDate: link.expiryDate ? new Date(link.expiryDate).getTime() : 0,
      passwordHash: link.password || '',
      linkId: String(link._id),
      userId: String(link.user),
      maxClicks: link.maxClicks || 0,
      iosRedirect: link.iosRedirect || '',
      androidRedirect: link.androidRedirect || '',
      expiredRedirectUrl: link.expiredRedirectUrl || '',
    };

    seedLinkUsage(meta.linkId, link.clicks || 0).catch((err) =>
      logger.error({ err, linkId: meta.linkId }, 'Failed to seed link usage counter')
    );
    setLinkMeta(shortCode, meta).catch((err) => logger.error({ err, shortCode }, 'Failed to populate link cache'));
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
      const usage = await checkAndIncrementUsage(meta.linkId, meta.maxClicks);
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
        invalidateLinkMeta(shortCode).catch((err) =>
          logger.error({ err, shortCode }, 'Failed to invalidate link meta after reaching maxClicks')
        );
      }
    }
  }

  if (meta.passwordHash) {
    const passwordOk = await verifyLinkPassword(meta.passwordHash, pwd, meta.linkId, shortCode);
    if (!passwordOk) {
      if (req.headers.accept?.includes('text/html') && !pwd) {
        return res.redirect(302, `${env.FRONTEND_URL}/${shortCode}`);
      }
      return res.status(403).json({
        success: false,
        requiresPassword: true,
        message: pwd ? 'Invalid password' : 'Password required to access this link',
      });
    }
  }

  // Determine device-specific target URL if configured
  const ua = getUserAgent(req);
  let destinationUrl = meta.originalUrl;
  if (/iphone|ipad|ipod/i.test(ua) && meta.iosRedirect) {
    destinationUrl = meta.iosRedirect;
  } else if (/android/i.test(ua) && meta.androidRedirect) {
    destinationUrl = meta.androidRedirect;
  }

  if (req.query.probe === '1') {
    return res.status(200).json({ success: true, originalUrl: destinationUrl });
  }

  res.set('Cache-Control', 'private, max-age=60');
  res.redirect(307, destinationUrl);

  // Fire-and-forget: never await Mongo writes or streaming on the hot path.
  incrementClickCounter(meta.linkId).catch((err) =>
    logger.error({ err, linkId: meta.linkId }, 'Failed to increment click counter')
  );
  emitClickEvent({
    linkId: meta.linkId,
    shortCode,
    userId: meta.userId,
    destinationUrl: meta.originalUrl,
    ip: getClientIp(req),
    ua: getUserAgent(req),
    referer: req.headers.referer || 'direct',
    timestamp: Date.now(),
    utmSource: req.query.utm_source,
    utmMedium: req.query.utm_medium,
    utmCampaign: req.query.utm_campaign,
  });
};

/**
 * Mongo/ClickEvent-backed fallback, used only when CLICKHOUSE_ENABLED is
 * false so analytics still function in a minimal deployment. ClickHouse is
 * the source of truth per Phase 3; this path only sees the last 30 days
 * (ClickEvent's TTL window).
 */
async function getLinkAnalyticsFromMongo(linkId) {
  const [analytics, recentClicks] = await Promise.all([
    Analytics.findOne({ link: linkId }).read('secondaryPreferred'),
    ClickEvent.find({ link: linkId }).sort({ timestamp: -1 }).limit(100).read('secondaryPreferred').lean(),
  ]);
  return { analytics, recentClicks };
}

async function getAnalyticsSummaryFromMongo(userId, start, end) {
  const links = await Link.find({ user: userId }).read('secondaryPreferred').lean();
  const linkIds = links.map((l) => l._id);
  const matchStage = { link: { $in: linkIds }, timestamp: { $gte: start, $lte: end } };

  const [totalClicks, byCountry, byDevice, byBrowser, byDay] = await Promise.all([
    ClickEvent.countDocuments(matchStage).read('secondaryPreferred'),
    ClickEvent.aggregate([
      { $match: matchStage },
      { $group: { _id: '$country', clicks: { $sum: 1 } } },
      { $match: { _id: { $nin: [null, ''] } } },
      { $sort: { clicks: -1 } },
      { $limit: 10 },
    ]).read('secondaryPreferred'),
    ClickEvent.aggregate([
      { $match: matchStage },
      { $group: { _id: '$device', clicks: { $sum: 1 } } },
      { $match: { _id: { $nin: [null, ''] } } },
    ]).read('secondaryPreferred'),
    ClickEvent.aggregate([
      { $match: matchStage },
      { $group: { _id: '$browser', clicks: { $sum: 1 } } },
      { $match: { _id: { $nin: [null, ''] } } },
      { $sort: { clicks: -1 } },
      { $limit: 10 },
    ]).read('secondaryPreferred'),
    ClickEvent.aggregate([
      { $match: matchStage },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, clicks: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).read('secondaryPreferred'),
  ]);

  return {
    totalClicks,
    uniqueVisitors: null, // not tracked without HyperLogLog in the Mongo fallback
    totalLinks: links.length,
    topCountries: byCountry.map((c) => ({ country: c._id, clicks: c.clicks })),
    topDevices: byDevice.map((d) => ({ device: d._id, clicks: d.clicks })),
    topBrowsers: byBrowser.map((b) => ({ browser: b._id, clicks: b.clicks })),
    clicksByDay: byDay.map((d) => ({ day: d._id, clicks: d.clicks })),
  };
}

// Get analytics for a link
export const getLinkAnalytics = async (req, res) => {
  try {
    const { linkId } = req.params;

    const link = await Link.findById(linkId).read('secondaryPreferred');

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    if (link.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (!env.CLICKHOUSE_ENABLED) {
      const { analytics, recentClicks } = await getLinkAnalyticsFromMongo(linkId);
      if (!analytics) return res.status(404).json({ success: false, message: 'Analytics not found' });
      return res.status(200).json({ success: true, analytics, recentClicks });
    }

    const db = env.CLICKHOUSE_DATABASE;
    const [totalsRows, byCountry, byDevice, byBrowser, byDay, recentClicks] = await Promise.all([
      runQuery(
        `SELECT sum(total_clicks) as totalClicks,
                uniqHLL12Merge(unique_visitors) as uniqueVisitors
         FROM ${db}.daily_link_stats WHERE link_id = {linkId:String}`,
        { linkId }
      ),
      runQuery(
        `SELECT country_code as country, count() as clicks FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND country_code != ''
         GROUP BY country_code ORDER BY clicks DESC LIMIT 10`,
        { linkId }
      ),
      runQuery(
        `SELECT device_type as device, count() as clicks FROM ${db}.click_events
         WHERE link_id = {linkId:String} GROUP BY device_type ORDER BY clicks DESC`,
        { linkId }
      ),
      runQuery(
        `SELECT browser_family as browser, count() as clicks FROM ${db}.click_events
         WHERE link_id = {linkId:String} GROUP BY browser_family ORDER BY clicks DESC LIMIT 10`,
        { linkId }
      ),
      runQuery(
        `SELECT toDate(timestamp) as day, count() as clicks FROM ${db}.click_events
         WHERE link_id = {linkId:String} GROUP BY day ORDER BY day ASC`,
        { linkId }
      ),
      runQuery(
        `SELECT event_id, timestamp, country_code, city, device_type, browser_family, os_family, referrer_domain
         FROM ${db}.click_events WHERE link_id = {linkId:String}
         ORDER BY timestamp DESC LIMIT 100`,
        { linkId }
      ),
    ]);

    const totals = totalsRows[0] || { totalClicks: 0, uniqueVisitors: 0 };

    res.status(200).json({
      success: true,
      analytics: {
        totalClicks: Number(totals.totalClicks) || 0,
        uniqueVisitors: Number(totals.uniqueVisitors) || 0,
        topCountries: byCountry.map((c) => ({ country: c.country, clicks: Number(c.clicks) })),
        topDevices: byDevice.map((d) => ({ device: d.device, clicks: Number(d.clicks) })),
        topBrowsers: byBrowser.map((b) => ({ browser: b.browser, clicks: Number(b.clicks) })),
        clicksByDay: byDay.map((d) => ({ day: d.day, clicks: Number(d.clicks) })),
      },
      recentClicks,
    });
  } catch (error) {
    logger.error({ err: error }, 'getLinkAnalytics failed');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get analytics summary
export const getAnalyticsSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (!env.CLICKHOUSE_ENABLED) {
      const summary = await getAnalyticsSummaryFromMongo(req.user.id, start, end);
      return res.status(200).json({ success: true, summary });
    }

    const db = env.CLICKHOUSE_DATABASE;
    // DateTime64 param binding requires 'YYYY-MM-DD HH:MM:SS.mmm' — the
    // ISO 'T'/'Z' separators aren't accepted here (unlike JSONEachRow insert
    // parsing, which has best_effort date parsing enabled).
    const toClickHouseDateTime = (d) => d.toISOString().replace('T', ' ').replace('Z', '');
    const params = {
      userId: req.user.id,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      startTs: toClickHouseDateTime(start),
      endTs: toClickHouseDateTime(end),
    };

    const [totalsRows, byCountry, byDevice, byBrowser, byDay, totalLinks] = await Promise.all([
      runQuery(
        `SELECT sum(total_clicks) as totalClicks,
                uniqHLL12Merge(unique_visitors) as uniqueVisitors
         FROM ${db}.daily_link_stats
         WHERE user_id = {userId:String} AND date BETWEEN {startDate:Date} AND {endDate:Date}`,
        params
      ),
      runQuery(
        `SELECT country_code as country, count() as clicks FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND country_code != ''
         GROUP BY country_code ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT device_type as device, count() as clicks FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY device_type ORDER BY clicks DESC`,
        params
      ),
      runQuery(
        `SELECT browser_family as browser, count() as clicks FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY browser_family ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT toDate(timestamp) as day, count() as clicks FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY day ORDER BY day ASC`,
        params
      ),
      Link.countDocuments({ user: req.user.id }).read('secondaryPreferred'),
    ]);

    const totals = totalsRows[0] || { totalClicks: 0, uniqueVisitors: 0 };

    res.status(200).json({
      success: true,
      summary: {
        totalClicks: Number(totals.totalClicks) || 0,
        uniqueVisitors: Number(totals.uniqueVisitors) || 0,
        totalLinks,
        topCountries: byCountry.map((c) => ({ country: c.country, clicks: Number(c.clicks) })),
        topDevices: byDevice.map((d) => ({ device: d.device, clicks: Number(d.clicks) })),
        topBrowsers: byBrowser.map((b) => ({ browser: b.browser, clicks: Number(b.clicks) })),
        clicksByDay: byDay.map((d) => ({ day: d.day, clicks: Number(d.clicks) })),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'getAnalyticsSummary failed');
    res.status(500).json({ success: false, message: error.message });
  }
};
