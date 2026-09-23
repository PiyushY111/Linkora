import mongoose from 'mongoose';
import Link from '../../models/Link.js';
import ClickEvent from '../../models/ClickEvent.js';
import { LinkStatsHourly, LinkStatsDaily } from '../../models/LinkStats.js';
import { env } from '../../config/env.js';
import { calculateGrowth, fillTimeSeries } from '../../services/analyticsTimeRange.js';
import { DIMENSION_NAMES, OTHER_KEY, decodeKey } from './rollupDimensions.js';
import { hourBucket, dayBucket } from './mongoAnalyticsWriter.js';

const TOP_N = 10;
const RECENT_CLICKS_LIMIT = 50;
const HOURLY_MAX_RANGE_MS = 48 * 60 * 60 * 1000;
const ROLLUP_PROJECTION = { appliedIds: 0 };

/**
 * Hourly rollups for ranges of 48h or less that are still inside their
 * retention window; daily rollups otherwise.
 * @returns {'hourly' | 'daily'}
 */
export function selectRollupGranularity(start, end, now = new Date()) {
  const retentionStart = now.getTime() - env.CLICK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const short = end.getTime() - start.getTime() <= HOURLY_MAX_RANGE_MS;
  return short && start.getTime() >= retentionStart ? 'hourly' : 'daily';
}

function findRollups(Model, scope, start, end, bucketOf) {
  return Model.collection
    .find({ ...scope, bucket: { $gte: bucketOf(start), $lte: end } }, { projection: ROLLUP_PROJECTION })
    .toArray();
}

function seriesKey(bucket, granularity) {
  const iso = bucket.toISOString();
  if (granularity === 'hour') return `${iso.slice(0, 10)} ${iso.slice(11, 13)}:00`;
  if (granularity === 'month') return iso.slice(0, 7);
  return iso.slice(0, 10);
}

/**
 * Sums rollup documents into totals, per-dimension counts and a time
 * series. `field` is 'a' (all clicks) or 'h' (humans only).
 */
function mergeRollups(docs, { excludeBots, granularity }) {
  const field = excludeBots ? 'h' : 'a';
  const merged = { total: 0, human: 0, bot: 0, unique: 0, dims: {}, series: new Map() };
  for (const name of DIMENSION_NAMES) merged.dims[name] = new Map();

  for (const doc of docs) {
    const clicks = excludeBots ? doc.human || 0 : doc.total || 0;
    merged.total += clicks;
    merged.human += doc.human || 0;
    merged.bot += doc.bot || 0;
    merged.unique += doc.unique || 0;
    const key = seriesKey(doc.bucket, granularity);
    merged.series.set(key, (merged.series.get(key) || 0) + clicks);
    for (const name of DIMENSION_NAMES) {
      for (const [encoded, counts] of Object.entries(doc.dims?.[name] || {})) {
        const n = counts?.[field] || 0;
        if (n > 0) merged.dims[name].set(encoded, (merged.dims[name].get(encoded) || 0) + n);
      }
    }
  }
  return merged;
}

function top(map, toEntry) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([encoded, clicks]) => toEntry(encoded === OTHER_KEY ? 'Other' : decodeKey(encoded), clicks));
}

function cityEntry(value, clicks) {
  if (value === 'Other') return { city: 'Other', country: '', clicks };
  const [country, ...rest] = value.split('|');
  return { city: rest.join('|'), country, clicks };
}

/**
 * Unique visitors are tracked per link per UTC day. For an hourly (<=48h)
 * range, report the uniques of the calendar days it touches: an
 * approximation documented in docs/architecture.md.
 */
async function uniqueVisitors(scope, start, end, granularity, dailyDocs) {
  const docs =
    granularity === 'daily' ? dailyDocs : await findRollups(LinkStatsDaily, scope, start, end, dayBucket);
  return docs.reduce((sum, d) => sum + (d.unique || 0), 0);
}

async function aggregate(scope, timeInfo, { excludeBots }) {
  const granularity = selectRollupGranularity(timeInfo.start, timeInfo.end);
  const [Model, bucketOf] = granularity === 'hourly' ? [LinkStatsHourly, hourBucket] : [LinkStatsDaily, dayBucket];

  const [current, prior] = await Promise.all([
    findRollups(Model, scope, timeInfo.start, timeInfo.end, bucketOf),
    findRollups(Model, scope, timeInfo.priorStart, timeInfo.priorEnd, bucketOf),
  ]);
  const now = mergeRollups(current, { excludeBots, granularity: timeInfo.granularity });
  const before = mergeRollups(prior, { excludeBots, granularity: timeInfo.granularity });
  const [uniqueNow, uniqueBefore] = await Promise.all([
    uniqueVisitors(scope, timeInfo.start, timeInfo.end, granularity, current),
    uniqueVisitors(scope, timeInfo.priorStart, timeInfo.priorEnd, granularity, prior),
  ]);

  const totalAll = now.human + now.bot;
  return {
    totalClicks: now.total,
    uniqueVisitors: uniqueNow,
    clickGrowth: calculateGrowth(now.total, before.total),
    visitorGrowth: calculateGrowth(uniqueNow, uniqueBefore),
    topCountries: top(now.dims.country, (country, clicks) => ({ country, clicks })),
    topCities: top(now.dims.city, cityEntry),
    topReferrers: top(now.dims.referrer, (referrer, clicks) => ({ referrer, clicks })),
    topDevices: top(now.dims.device, (device, clicks) => ({ device, clicks })),
    topOperatingSystems: top(now.dims.os, (os, clicks) => ({ os, clicks })),
    topBrowsers: top(now.dims.browser, (browser, clicks) => ({ browser, clicks })),
    clicksByDay: fillTimeSeries(
      [...now.series.entries()].map(([day, clicks]) => ({ day, clicks })),
      timeInfo.start,
      timeInfo.end,
      timeInfo.granularity
    ),
    utmCampaigns: top(now.dims.utmCampaign, (name, clicks) => ({ name, clicks })),
    utmSources: top(now.dims.utmSource, (name, clicks) => ({ name, clicks })),
    utmMediums: top(now.dims.utmMedium, (name, clicks) => ({ name, clicks })),
    botBreakdown: {
      humanClicks: now.human,
      botClicks: now.bot,
      totalClicks: totalAll,
      botPercentage: totalAll > 0 ? Number(((now.bot / totalAll) * 100).toFixed(1)) : 0,
      isFiltered: Boolean(excludeBots),
    },
    timeRange: timeInfo.timeRange,
    granularity: timeInfo.granularity,
  };
}

/** Recent clicks, in the flat snake_case shape the realtime stream renders. */
async function recentClicks(metaScope) {
  const events = await ClickEvent.collection
    .find(metaScope)
    .sort({ timestamp: -1 })
    .limit(RECENT_CLICKS_LIMIT)
    .toArray();
  return events.map((ev) => ({
    event_id: ev.eventId,
    timestamp: ev.timestamp,
    country_code: ev.country || '',
    city: ev.city || '',
    device_type: ev.device || '',
    browser_family: ev.browser || '',
    os_family: ev.os || '',
    referrer_domain: ev.referrerDomain || '',
    utm_source: ev.utmSource || '',
    utm_campaign: ev.utmCampaign || '',
  }));
}

export async function getLinkAnalytics(linkId, timeInfo, { excludeBots }) {
  const id = new mongoose.Types.ObjectId(linkId);
  const [analytics, recent] = await Promise.all([
    aggregate({ linkId: id }, timeInfo, { excludeBots }),
    recentClicks({ 'meta.linkId': id }),
  ]);
  return { analytics, recentClicks: recent };
}

export async function getUserSummary(userId, timeInfo) {
  const id = new mongoose.Types.ObjectId(userId);
  const [{ botBreakdown, ...summary }, recent, totalLinks] = await Promise.all([
    aggregate({ userId: id }, timeInfo, { excludeBots: false }),
    recentClicks({ 'meta.userId': id }),
    Link.countDocuments({ user: id }),
  ]);
  return { ...summary, totalLinks, recentClicks: recent };
}

export async function* exportEvents({ linkId, userId, start, end, limit }) {
  const scope = linkId
    ? { 'meta.linkId': new mongoose.Types.ObjectId(linkId) }
    : { 'meta.userId': new mongoose.Types.ObjectId(userId) };
  const cursor = ClickEvent.collection
    .find({ ...scope, timestamp: { $gte: start, $lte: end } })
    .sort({ timestamp: -1 })
    .limit(limit);
  for await (const ev of cursor) {
    yield {
      eventId: ev.eventId,
      timestamp: ev.timestamp,
      shortCode: ev.shortCode || '',
      country: ev.country || '',
      city: ev.city || '',
      device: ev.device || '',
      browser: ev.browser || '',
      os: ev.os || '',
      referrerDomain: ev.referrerDomain || '',
      utmSource: ev.utmSource || '',
      utmMedium: ev.utmMedium || '',
      utmCampaign: ev.utmCampaign || '',
    };
  }
}
