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
import { dispatchEvent } from '../services/webhookService.js';

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
 * Computes time range boundaries, comparison periods, and appropriate
 * interval granularity (hour vs day vs month).
 */
export function calculateTimeRange(timeRange = '30d', customStart, customEnd) {
  const now = new Date();
  let start, end;
  let granularity = 'day';

  switch (timeRange) {
    case 'today':
    case '24h': {
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      end = now;
      granularity = 'hour';
      break;
    }
    case '7d': {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      end = now;
      granularity = 'day';
      break;
    }
    case '30d': {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = now;
      granularity = 'day';
      break;
    }
    case '90d': {
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      end = now;
      granularity = 'day';
      break;
    }
    case 'ytd': {
      start = new Date(now.getFullYear(), 0, 1);
      end = now;
      granularity = 'month';
      break;
    }
    case 'all': {
      start = new Date(2020, 0, 1);
      end = now;
      granularity = 'month';
      break;
    }
    case 'custom':
    default: {
      end = customEnd ? new Date(customEnd) : now;
      start = customStart
        ? new Date(customStart)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      granularity = diffDays <= 2 ? 'hour' : diffDays <= 90 ? 'day' : 'month';
      break;
    }
  }

  const durationMs = Math.max(60000, end.getTime() - start.getTime());
  const priorEnd = new Date(start.getTime());
  const priorStart = new Date(start.getTime() - durationMs);

  return {
    start,
    end,
    priorStart,
    priorEnd,
    granularity,
    timeRange,
  };
}

const toClickHouseDateTime = (d) => d.toISOString().replace('T', ' ').replace('Z', '');

function calculateGrowth(current, prior) {
  if (!prior || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

function fillTimeSeries(rows, start, end, granularity) {
  const map = new Map();
  for (const r of rows) {
    if (r.day) {
      let key = String(r.day);
      if (key.length >= 19) {
        key = key.slice(0, 13) + ':00';
      }
      map.set(key, Number(r.clicks) || 0);
    }
  }

  const result = [];
  const current = new Date(start);
  const finish = new Date(end);

  if (granularity === 'hour') {
    current.setUTCMinutes(0, 0, 0);
    while (current <= finish) {
      const yyyy = current.getUTCFullYear();
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(current.getUTCDate()).padStart(2, '0');
      const hh = String(current.getUTCHours()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd} ${hh}:00`;
      result.push({ day: key, clicks: map.get(key) || 0 });
      current.setUTCHours(current.getUTCHours() + 1);
    }
  } else if (granularity === 'day') {
    current.setUTCHours(0, 0, 0, 0);
    while (current <= finish) {
      const yyyy = current.getUTCFullYear();
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(current.getUTCDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      result.push({ day: key, clicks: map.get(key) || 0 });
      current.setUTCDate(current.getUTCDate() + 1);
    }
  } else {
    current.setUTCDate(1);
    current.setUTCHours(0, 0, 0, 0);
    while (current <= finish) {
      const yyyy = current.getUTCFullYear();
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
      const key = `${yyyy}-${mm}`;
      result.push({ day: key, clicks: map.get(key) || 0 });
      current.setUTCMonth(current.getUTCMonth() + 1);
    }
  }

  return result;
}

/**
 * Mongo/ClickEvent-backed fallback for link analytics.
 */
async function getLinkAnalyticsFromMongo(linkId, timeInfo) {
  const matchStage = {
    link: linkId,
    timestamp: { $gte: timeInfo.start, $lte: timeInfo.end },
  };
  const priorMatchStage = {
    link: linkId,
    timestamp: { $gte: timeInfo.priorStart, $lte: timeInfo.priorEnd },
  };

  const [totalClicks, priorClicks, byCountry, byDevice, byBrowser, byDay, recentClicks] =
    await Promise.all([
      ClickEvent.countDocuments(matchStage).read('secondaryPreferred'),
      ClickEvent.countDocuments(priorMatchStage).read('secondaryPreferred'),
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
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            clicks: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).read('secondaryPreferred'),
      ClickEvent.find({ link: linkId })
        .sort({ timestamp: -1 })
        .limit(50)
        .read('secondaryPreferred')
        .lean(),
    ]);

  return {
    analytics: {
      totalClicks,
      uniqueVisitors: totalClicks,
      clickGrowth: calculateGrowth(totalClicks, priorClicks),
      visitorGrowth: calculateGrowth(totalClicks, priorClicks),
      topCountries: byCountry.map((c) => ({ country: c._id, clicks: c.clicks })),
      topCities: [],
      topReferrers: [],
      topDevices: byDevice.map((d) => ({ device: d._id, clicks: d.clicks })),
      topOperatingSystems: [],
      topBrowsers: byBrowser.map((b) => ({ browser: b._id, clicks: b.clicks })),
      clicksByDay: fillTimeSeries(
        byDay.map((d) => ({ day: d._id, clicks: d.clicks })),
        timeInfo.start,
        timeInfo.end,
        timeInfo.granularity
      ),
      utmCampaigns: [],
      utmSources: [],
      utmMediums: [],
      timeRange: timeInfo.timeRange,
      granularity: timeInfo.granularity,
    },
    recentClicks,
  };
}

/**
 * Mongo/ClickEvent-backed fallback for aggregate user summary.
 */
async function getAnalyticsSummaryFromMongo(userId, timeInfo) {
  const links = await Link.find({ user: userId }).read('secondaryPreferred').lean();
  const linkIds = links.map((l) => l._id);
  const matchStage = {
    link: { $in: linkIds },
    timestamp: { $gte: timeInfo.start, $lte: timeInfo.end },
  };
  const priorMatchStage = {
    link: { $in: linkIds },
    timestamp: { $gte: timeInfo.priorStart, $lte: timeInfo.priorEnd },
  };

  const [totalClicks, priorClicks, byCountry, byDevice, byBrowser, byDay] =
    await Promise.all([
      ClickEvent.countDocuments(matchStage).read('secondaryPreferred'),
      ClickEvent.countDocuments(priorMatchStage).read('secondaryPreferred'),
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
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            clicks: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).read('secondaryPreferred'),
    ]);

  return {
    totalClicks,
    uniqueVisitors: totalClicks,
    clickGrowth: calculateGrowth(totalClicks, priorClicks),
    visitorGrowth: calculateGrowth(totalClicks, priorClicks),
    totalLinks: links.length,
    topCountries: byCountry.map((c) => ({ country: c._id, clicks: c.clicks })),
    topCities: [],
    topReferrers: [],
    topDevices: byDevice.map((d) => ({ device: d._id, clicks: d.clicks })),
    topOperatingSystems: [],
    topBrowsers: byBrowser.map((b) => ({ browser: b._id, clicks: b.clicks })),
    clicksByDay: fillTimeSeries(
      byDay.map((d) => ({ day: d._id, clicks: d.clicks })),
      timeInfo.start,
      timeInfo.end,
      timeInfo.granularity
    ),
    utmCampaigns: [],
    utmSources: [],
    utmMediums: [],
    timeRange: timeInfo.timeRange,
    granularity: timeInfo.granularity,
  };
}

// Get analytics for a specific link
export const getLinkAnalytics = async (req, res) => {
  try {
    const { linkId } = req.params;
    const timeInfo = calculateTimeRange(
      req.query.timeRange,
      req.query.startDate,
      req.query.endDate
    );

    const link = await Link.findById(linkId).read('secondaryPreferred');
    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }
    if (link.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (!env.CLICKHOUSE_ENABLED) {
      const result = await getLinkAnalyticsFromMongo(linkId, timeInfo);
      return res.status(200).json({ success: true, ...result });
    }

    const db = env.CLICKHOUSE_DATABASE;
    const params = {
      linkId,
      startTs: toClickHouseDateTime(timeInfo.start),
      endTs: toClickHouseDateTime(timeInfo.end),
      priorStartTs: toClickHouseDateTime(timeInfo.priorStart),
      priorEndTs: toClickHouseDateTime(timeInfo.priorEnd),
    };

    const timeGroupQuery =
      timeInfo.granularity === 'hour'
        ? `SELECT formatDateTime(toStartOfHour(timestamp), '%Y-%m-%d %H:00') as day, count() as clicks
           FROM ${db}.click_events
           WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           GROUP BY day ORDER BY day ASC`
        : `SELECT toDate(timestamp) as day, count() as clicks
           FROM ${db}.click_events
           WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           GROUP BY day ORDER BY day ASC`;

    const [
      totalsRows,
      priorTotalsRows,
      byCountry,
      byCity,
      byReferrer,
      byDevice,
      byOs,
      byBrowser,
      byDay,
      utmCampaigns,
      utmSources,
      utmMediums,
      recentClicks,
    ] = await Promise.all([
      runQuery(
        `SELECT count() as totalClicks, uniq(ip_hash) as uniqueVisitors
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}`,
        params
      ),
      runQuery(
        `SELECT count() as priorClicks, uniq(ip_hash) as priorUniqueVisitors
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {priorStartTs:DateTime64(3, 'UTC')} AND {priorEndTs:DateTime64(3, 'UTC')}`,
        params
      ),
      runQuery(
        `SELECT country_code as country, count() as clicks
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND country_code != ''
         GROUP BY country_code ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT city, country_code, count() as clicks
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND city != ''
         GROUP BY city, country_code ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT if(referrer_domain = '' OR referrer_domain = 'Direct / Dark Traffic' OR referrer_domain = 'localhost' OR referrer_domain LIKE '127.0.0.1%' OR referrer_domain LIKE 'localhost%', 'Direct', referrer_domain) as referrer, count() as clicks
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY referrer ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT device_type as device, count() as clicks
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY device_type ORDER BY clicks DESC`,
        params
      ),
      runQuery(
        `SELECT if(os_family = '', 'Unknown', os_family) as os, count() as clicks
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY os ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT browser_family as browser, count() as clicks
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY browser_family ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(timeGroupQuery, params),
      runQuery(
        `SELECT utm_campaign as name, count() as clicks
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND utm_campaign != ''
         GROUP BY utm_campaign ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT utm_source as name, count() as clicks
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND utm_source != ''
         GROUP BY utm_source ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT utm_medium as name, count() as clicks
         FROM ${db}.click_events
         WHERE link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND utm_medium != ''
         GROUP BY utm_medium ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT event_id, timestamp, country_code, city, device_type, browser_family, os_family, referrer_domain, utm_source, utm_campaign
         FROM ${db}.click_events
         WHERE link_id = {linkId:String}
         ORDER BY timestamp DESC LIMIT 50`,
        { linkId }
      ),
    ]);

    const totals = totalsRows[0] || { totalClicks: 0, uniqueVisitors: 0 };
    const priorTotals = priorTotalsRows[0] || { priorClicks: 0, priorUniqueVisitors: 0 };

    const totalClicks = Number(totals.totalClicks) || 0;
    const uniqueVisitors = Number(totals.uniqueVisitors) || 0;
    const priorClicks = Number(priorTotals.priorClicks) || 0;
    const priorUniqueVisitors = Number(priorTotals.priorUniqueVisitors) || 0;

    res.status(200).json({
      success: true,
      analytics: {
        totalClicks,
        uniqueVisitors,
        clickGrowth: calculateGrowth(totalClicks, priorClicks),
        visitorGrowth: calculateGrowth(uniqueVisitors, priorUniqueVisitors),
        topCountries: byCountry.map((c) => ({ country: c.country, clicks: Number(c.clicks) })),
        topCities: byCity.map((c) => ({
          city: c.city,
          country: c.country_code,
          clicks: Number(c.clicks),
        })),
        topReferrers: byReferrer.map((r) => ({ referrer: r.referrer, clicks: Number(r.clicks) })),
        topDevices: byDevice.map((d) => ({ device: d.device, clicks: Number(d.clicks) })),
        topOperatingSystems: byOs.map((o) => ({ os: o.os, clicks: Number(o.clicks) })),
        topBrowsers: byBrowser.map((b) => ({ browser: b.browser, clicks: Number(b.clicks) })),
        clicksByDay: fillTimeSeries(byDay, timeInfo.start, timeInfo.end, timeInfo.granularity),
        utmCampaigns: utmCampaigns.map((u) => ({ name: u.name, clicks: Number(u.clicks) })),
        utmSources: utmSources.map((u) => ({ name: u.name, clicks: Number(u.clicks) })),
        utmMediums: utmMediums.map((u) => ({ name: u.name, clicks: Number(u.clicks) })),
        timeRange: timeInfo.timeRange,
        granularity: timeInfo.granularity,
      },
      recentClicks,
    });
  } catch (error) {
    logger.error({ err: error }, 'getLinkAnalytics failed');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get aggregated enterprise analytics summary across all user links
export const getAnalyticsSummary = async (req, res) => {
  try {
    const timeInfo = calculateTimeRange(
      req.query.timeRange,
      req.query.startDate,
      req.query.endDate
    );

    if (!env.CLICKHOUSE_ENABLED) {
      const summary = await getAnalyticsSummaryFromMongo(req.user.id, timeInfo);
      return res.status(200).json({ success: true, summary });
    }

    const db = env.CLICKHOUSE_DATABASE;
    const params = {
      userId: req.user.id,
      startTs: toClickHouseDateTime(timeInfo.start),
      endTs: toClickHouseDateTime(timeInfo.end),
      priorStartTs: toClickHouseDateTime(timeInfo.priorStart),
      priorEndTs: toClickHouseDateTime(timeInfo.priorEnd),
    };

    const timeGroupQuery =
      timeInfo.granularity === 'hour'
        ? `SELECT formatDateTime(toStartOfHour(timestamp), '%Y-%m-%d %H:00') as day, count() as clicks
           FROM ${db}.click_events
           WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           GROUP BY day ORDER BY day ASC`
        : `SELECT toDate(timestamp) as day, count() as clicks
           FROM ${db}.click_events
           WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           GROUP BY day ORDER BY day ASC`;

    const [
      totalsRows,
      priorTotalsRows,
      byCountry,
      byCity,
      byReferrer,
      byDevice,
      byOs,
      byBrowser,
      byDay,
      utmCampaigns,
      utmSources,
      utmMediums,
      recentClicks,
      totalLinks,
    ] = await Promise.all([
      runQuery(
        `SELECT count() as totalClicks, uniq(ip_hash) as uniqueVisitors
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}`,
        params
      ),
      runQuery(
        `SELECT count() as priorClicks, uniq(ip_hash) as priorUniqueVisitors
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {priorStartTs:DateTime64(3, 'UTC')} AND {priorEndTs:DateTime64(3, 'UTC')}`,
        params
      ),
      runQuery(
        `SELECT country_code as country, count() as clicks
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND country_code != ''
         GROUP BY country_code ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT city, country_code, count() as clicks
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND city != ''
         GROUP BY city, country_code ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT if(referrer_domain = '' OR referrer_domain = 'Direct / Dark Traffic' OR referrer_domain = 'localhost' OR referrer_domain LIKE '127.0.0.1%' OR referrer_domain LIKE 'localhost%', 'Direct', referrer_domain) as referrer, count() as clicks
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY referrer ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT device_type as device, count() as clicks
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY device_type ORDER BY clicks DESC`,
        params
      ),
      runQuery(
        `SELECT if(os_family = '', 'Unknown', os_family) as os, count() as clicks
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY os ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT browser_family as browser, count() as clicks
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
         GROUP BY browser_family ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(timeGroupQuery, params),
      runQuery(
        `SELECT utm_campaign as name, count() as clicks
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND utm_campaign != ''
         GROUP BY utm_campaign ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT utm_source as name, count() as clicks
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND utm_source != ''
         GROUP BY utm_source ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT utm_medium as name, count() as clicks
         FROM ${db}.click_events
         WHERE user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}
           AND utm_medium != ''
         GROUP BY utm_medium ORDER BY clicks DESC LIMIT 10`,
        params
      ),
      runQuery(
        `SELECT event_id, timestamp, country_code, city, device_type, browser_family, os_family, referrer_domain, utm_source, utm_campaign
         FROM ${db}.click_events
         WHERE user_id = {userId:String}
         ORDER BY timestamp DESC LIMIT 50`,
        { userId: req.user.id }
      ),
      Link.countDocuments({ user: req.user.id }).read('secondaryPreferred'),
    ]);

    const totals = totalsRows[0] || { totalClicks: 0, uniqueVisitors: 0 };
    const priorTotals = priorTotalsRows[0] || { priorClicks: 0, priorUniqueVisitors: 0 };

    const totalClicks = Number(totals.totalClicks) || 0;
    const uniqueVisitors = Number(totals.uniqueVisitors) || 0;
    const priorClicks = Number(priorTotals.priorClicks) || 0;
    const priorUniqueVisitors = Number(priorTotals.priorUniqueVisitors) || 0;

    res.status(200).json({
      success: true,
      summary: {
        totalClicks,
        uniqueVisitors,
        clickGrowth: calculateGrowth(totalClicks, priorClicks),
        visitorGrowth: calculateGrowth(uniqueVisitors, priorUniqueVisitors),
        totalLinks,
        topCountries: byCountry.map((c) => ({ country: c.country, clicks: Number(c.clicks) })),
        topCities: byCity.map((c) => ({
          city: c.city,
          country: c.country_code,
          clicks: Number(c.clicks),
        })),
        topReferrers: byReferrer.map((r) => ({ referrer: r.referrer, clicks: Number(r.clicks) })),
        topDevices: byDevice.map((d) => ({ device: d.device, clicks: Number(d.clicks) })),
        topOperatingSystems: byOs.map((o) => ({ os: o.os, clicks: Number(o.clicks) })),
        topBrowsers: byBrowser.map((b) => ({ browser: b.browser, clicks: Number(b.clicks) })),
        clicksByDay: fillTimeSeries(byDay, timeInfo.start, timeInfo.end, timeInfo.granularity),
        utmCampaigns: utmCampaigns.map((u) => ({ name: u.name, clicks: Number(u.clicks) })),
        utmSources: utmSources.map((u) => ({ name: u.name, clicks: Number(u.clicks) })),
        utmMediums: utmMediums.map((u) => ({ name: u.name, clicks: Number(u.clicks) })),
        timeRange: timeInfo.timeRange,
        granularity: timeInfo.granularity,
        recentClicks,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'getAnalyticsSummary failed');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Export raw click analytics stream as downloadable CSV
export const exportAnalytics = async (req, res) => {
  try {
    const { linkId, timeRange, startDate, endDate } = req.query;
    const timeInfo = calculateTimeRange(timeRange, startDate, endDate);

    let queryCondition = '';
    const queryParams = {
      startTs: toClickHouseDateTime(timeInfo.start),
      endTs: toClickHouseDateTime(timeInfo.end),
    };

    if (linkId && linkId !== 'all') {
      const link = await Link.findById(linkId).read('secondaryPreferred');
      if (!link || link.user.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Not authorized for this link' });
      }
      queryCondition = `link_id = {linkId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}`;
      queryParams.linkId = linkId;
    } else {
      queryCondition = `user_id = {userId:String} AND timestamp BETWEEN {startTs:DateTime64(3, 'UTC')} AND {endTs:DateTime64(3, 'UTC')}`;
      queryParams.userId = req.user.id;
    }

    const filename = `linkly-analytics-${linkId || 'all'}-${timeInfo.timeRange}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write CSV header
    res.write(
      'Event ID,Timestamp (UTC),Short Code,Country,City,Device,Browser,OS,Referrer,UTM Source,UTM Medium,UTM Campaign\n'
    );

    if (env.CLICKHOUSE_ENABLED) {
      const db = env.CLICKHOUSE_DATABASE;
      const rows = await runQuery(
        `SELECT event_id, timestamp, short_code, country_code, city, device_type, browser_family, os_family, referrer_domain, utm_source, utm_medium, utm_campaign
         FROM ${db}.click_events
         WHERE ${queryCondition}
         ORDER BY timestamp DESC LIMIT 10000`,
        queryParams
      );

      for (const row of rows) {
        const line = [
          row.event_id || '',
          row.timestamp || '',
          row.short_code || '',
          row.country_code || '',
          (row.city || '').replace(/,/g, ' '),
          row.device_type || '',
          row.browser_family || '',
          row.os_family || '',
          row.referrer_domain || 'Direct',
          row.utm_source || '',
          row.utm_medium || '',
          row.utm_campaign || '',
        ].join(',');
        res.write(`${line}\n`);
      }
    } else {
      // Mongo fallback
      const mongoFilter = {
        timestamp: { $gte: timeInfo.start, $lte: timeInfo.end },
      };
      if (linkId && linkId !== 'all') {
        mongoFilter.link = linkId;
      } else {
        const links = await Link.find({ user: req.user.id }).lean();
        mongoFilter.link = { $in: links.map((l) => l._id) };
      }

      const events = await ClickEvent.find(mongoFilter)
        .sort({ timestamp: -1 })
        .limit(10000)
        .lean();

      for (const ev of events) {
        const line = [
          ev._id || '',
          ev.timestamp ? ev.timestamp.toISOString() : '',
          ev.shortCode || '',
          ev.country || '',
          (ev.city || '').replace(/,/g, ' '),
          ev.device || '',
          ev.browser || '',
          ev.os || '',
          ev.referrer || 'Direct',
          ev.utm?.source || '',
          ev.utm?.medium || '',
          ev.utm?.campaign || '',
        ].join(',');
        res.write(`${line}\n`);
      }
    }

    res.end();
  } catch (error) {
    logger.error({ err: error }, 'exportAnalytics failed');
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to export analytics' });
    }
  }
};

