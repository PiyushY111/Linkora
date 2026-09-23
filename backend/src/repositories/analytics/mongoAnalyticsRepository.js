import mongoose from 'mongoose';
import Link from '../../models/Link.js';
import ClickEvent from '../../models/ClickEvent.js';
import { logger } from '../../config/logger.js';
import { calculateGrowth, fillTimeSeries } from '../../services/analyticsTimeRange.js';

const TOP_N = 10;
const RECENT_CLICKS_LIMIT = 50;

function extractDomain(referer) {
  if (!referer || referer === 'direct') return '';
  try {
    return new URL(referer).hostname;
  } catch {
    return '';
  }
}

/**
 * The realtime stream and the dashboard read recent clicks in this shape
 * (snake_case, one flat object per click); keep it stable.
 */
function toRecentClick(ev) {
  return {
    event_id: String(ev._id),
    timestamp: ev.timestamp,
    country_code: ev.country || '',
    city: ev.city || '',
    device_type: ev.device || '',
    browser_family: ev.browser || '',
    os_family: ev.os || '',
    referrer_domain: extractDomain(ev.referer),
    utm_source: ev.utmSource || '',
    utm_campaign: ev.utmCampaign || '',
  };
}

function groupTop(match, field, limit = TOP_N) {
  return ClickEvent.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, clicks: { $sum: 1 } } },
    { $match: { _id: { $nin: [null, ''] } } },
    { $sort: { clicks: -1 } },
    { $limit: limit },
  ]);
}

function groupByDay(match) {
  return ClickEvent.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, clicks: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
}

async function aggregateClicks(scope, timeInfo, excludeBots) {
  const botFilter = excludeBots ? { isBot: { $ne: true } } : {};
  const match = { ...scope, timestamp: { $gte: timeInfo.start, $lte: timeInfo.end }, ...botFilter };
  const priorMatch = { ...scope, timestamp: { $gte: timeInfo.priorStart, $lte: timeInfo.priorEnd }, ...botFilter };

  const [totalClicks, priorClicks, byCountry, byDevice, byBrowser, byDay] = await Promise.all([
    ClickEvent.countDocuments(match),
    ClickEvent.countDocuments(priorMatch),
    groupTop(match, 'country'),
    groupTop(match, 'device'),
    groupTop(match, 'browser'),
    groupByDay(match),
  ]);

  return {
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
  };
}

async function recentClicks(scope) {
  const events = await ClickEvent.find(scope).sort({ timestamp: -1 }).limit(RECENT_CLICKS_LIMIT).lean();
  return events.map(toRecentClick);
}

async function linkIdsForUser(userId) {
  const links = await Link.find({ user: userId }).select('_id').lean();
  return links.map((l) => l._id);
}

/** @type {import('./analyticsRepository.js').AnalyticsRepository} */
export const mongoAnalyticsRepository = {
  async recordClicks(events) {
    if (events.length === 0) return { applied: [] };
    const docs = events.map((e) => ({
      link: e.linkId,
      user: e.userId,
      shortCode: e.shortCode,
      timestamp: e.timestamp,
      ipHash: e.ipHash,
      referer: e.referrerDomain ? `https://${e.referrerDomain}` : 'direct',
      device: e.device,
      browser: e.browser,
      os: e.os,
      country: e.country,
      city: e.city,
      utmSource: e.utmSource,
      utmMedium: e.utmMedium,
      utmCampaign: e.utmCampaign,
      variantId: e.variantId,
      variantName: e.variantName,
      isBot: e.isBot,
      botName: e.botName,
    }));
    await ClickEvent.insertMany(docs, { ordered: false }).catch((err) =>
      logger.error({ err }, 'Failed to bulk insert ClickEvent rows')
    );
    return { applied: events };
  },

  async getLinkAnalytics(linkId, timeInfo, { excludeBots }) {
    // Aggregation pipelines don't cast, so the ID must already be an ObjectId.
    const scope = { link: new mongoose.Types.ObjectId(linkId) };
    const range = { $gte: timeInfo.start, $lte: timeInfo.end };
    const [analytics, recent, botBreakdownAgg] = await Promise.all([
      aggregateClicks(scope, timeInfo, excludeBots),
      recentClicks(scope),
      ClickEvent.aggregate([
        { $match: { ...scope, timestamp: range } },
        { $group: { _id: '$isBot', clicks: { $sum: 1 } } },
      ]),
    ]);

    let botClicks = 0;
    let humanClicks = 0;
    for (const b of botBreakdownAgg) {
      if (b._id === true) botClicks = b.clicks;
      else humanClicks += b.clicks;
    }
    const totalAll = humanClicks + botClicks;

    return {
      analytics: {
        ...analytics,
        botBreakdown: {
          humanClicks,
          botClicks,
          totalClicks: totalAll,
          botPercentage: totalAll > 0 ? Number(((botClicks / totalAll) * 100).toFixed(1)) : 0,
          isFiltered: Boolean(excludeBots),
        },
      },
      recentClicks: recent,
    };
  },

  async getUserSummary(userId, timeInfo) {
    const linkIds = await linkIdsForUser(userId);
    const scope = { link: { $in: linkIds } };
    const [summary, recent] = await Promise.all([aggregateClicks(scope, timeInfo, false), recentClicks(scope)]);
    return { ...summary, totalLinks: linkIds.length, recentClicks: recent };
  },

  async *exportEvents({ linkId, userId, start, end, limit }) {
    const scope = linkId
      ? { link: new mongoose.Types.ObjectId(linkId) }
      : { link: { $in: await linkIdsForUser(userId) } };
    const cursor = ClickEvent.find({ ...scope, timestamp: { $gte: start, $lte: end } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
      .cursor();
    for await (const ev of cursor) {
      yield {
        eventId: String(ev._id),
        timestamp: ev.timestamp,
        shortCode: ev.shortCode || '',
        country: ev.country || '',
        city: ev.city || '',
        device: ev.device || '',
        browser: ev.browser || '',
        os: ev.os || '',
        referrerDomain: extractDomain(ev.referer),
        utmSource: ev.utmSource || '',
        utmMedium: ev.utmMedium || '',
        utmCampaign: ev.utmCampaign || '',
      };
    }
  },
};
