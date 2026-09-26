import BioPage from '../models/BioPage.js';
import BioPageViewDaily from '../models/BioPageViewDaily.js';
import { fillTimeSeries } from './analyticsTimeRange.js';


function utcDayStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Counts one view of a bio page: the all-time total and today's (UTC)
 * bucket. Both are plain $inc upserts, so there is nothing to retry.
 * @param {import('mongoose').Types.ObjectId} bioPageId
 * @param {Date} [at]
 */
export async function recordBioPageView(bioPageId, at = new Date()) {
  await Promise.all([
    BioPage.updateOne({ _id: bioPageId }, { $inc: { viewCount: 1 } }),
    BioPageViewDaily.updateOne(
      { bioPage: bioPageId, day: utcDayStart(at) },
      { $inc: { views: 1 } },
      { upsert: true }
    ),
  ]);
}

/**
 * Views per bucket over `timeInfo`, zero-filled like the click charts.
 * Views are only kept per day, so an hourly range is reported by day.
 * @param {import('mongoose').Types.ObjectId} bioPageId
 * @param {{ start: Date, end: Date, granularity: 'hour' | 'day' | 'month' }} timeInfo
 * @returns {Promise<{ granularity: 'day' | 'month', series: { day: string, views: number }[], total: number }>}
 */
export async function getBioPageViewSeries(bioPageId, timeInfo) {
  const granularity = timeInfo.granularity === 'month' ? 'month' : 'day';
  const docs = await BioPageViewDaily.find({
    bioPage: bioPageId,
    day: { $gte: utcDayStart(timeInfo.start), $lte: timeInfo.end },
  })
    .select('day views')
    .lean();

  const byBucket = new Map();
  for (const { day, views } of docs) {
    const key = day.toISOString().slice(0, granularity === 'month' ? 7 : 10);
    byBucket.set(key, (byBucket.get(key) || 0) + views);
  }

  const series = fillTimeSeries(
    [...byBucket].map(([day, views]) => ({ day, clicks: views })),
    timeInfo.start,
    timeInfo.end,
    granularity
  ).map(({ day, clicks }) => ({ day, views: clicks }));

  return { granularity, series, total: docs.reduce((sum, doc) => sum + doc.views, 0) };
}
