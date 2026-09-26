import BioPage from '../models/BioPage.js';
import Link from '../models/Link.js';
import { calculateTimeRange } from '../services/analyticsTimeRange.js';
import { getAnalyticsRepository } from '../repositories/analytics/analyticsRepository.js';
import { getBioPageViewSeries } from '../services/bioPageViews.js';
import { NotFoundError } from '../lib/errors.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

// Each item's stats come from the same per-link analytics call as the link
// analytics page (several rollup queries each), so run a few at a time
// rather than one burst for a 100-item page.
const LINK_STATS_CONCURRENCY = 5;

/**
 * Click stats for each distinct link on the page that still belongs to the
 * workspace, keyed by link id. No aggregation of its own: every number is
 * the analytics repository's, exactly as the link analytics page shows it.
 */
async function clickStatsByLink(page, workspaceId, timeInfo, excludeBots) {
  const linkIds = [...new Set(page.items.map((item) => String(item.linkId)))];
  const links = await Link.find({ _id: { $in: linkIds }, workspace: workspaceId })
    .select('shortCode shortUrl isActive')
    .lean();

  const stats = await mapWithConcurrency(links, LINK_STATS_CONCURRENCY, async (link) => {
    const { analytics } = await getAnalyticsRepository().getLinkAnalytics(String(link._id), timeInfo, { excludeBots });
    return [String(link._id), { link, analytics }];
  });
  return new Map(stats);
}

const toPercent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/**
 * GET /api/workspaces/:workspaceId/bio-page/analytics?timeRange=30d
 * The workspace's bio page views (all-time and per day over the range) and,
 * per item, its link's clicks over the same range. A link's clicks include
 * every click on that short link, wherever it was shared, not only clicks
 * from the bio page.
 */
export const getBioPageAnalytics = async (req, res) => {
  const workspaceId = req.workspace._id;
  const timeInfo = calculateTimeRange(req.query.timeRange, req.query.startDate, req.query.endDate);
  const excludeBots = req.query.excludeBots === 'true';

  const page = await BioPage.findOne({ workspace: workspaceId }).lean();
  if (!page) throw new NotFoundError('This workspace has no bio page yet');

  const [views, statsByLink] = await Promise.all([
    getBioPageViewSeries(page._id, timeInfo),
    clickStatsByLink(page, workspaceId, timeInfo, excludeBots),
  ]);

  // A link listed twice is still one link's clicks: count it once in the total.
  const totalItemClicks = [...statsByLink.values()].reduce((sum, { analytics }) => sum + analytics.totalClicks, 0);

  const items = [...page.items]
    .sort((a, b) => a.order - b.order || String(a._id).localeCompare(String(b._id)))
    .map((item) => {
      const stats = statsByLink.get(String(item.linkId));
      const clicks = stats ? stats.analytics.totalClicks : null;
      return {
        itemId: String(item._id),
        label: item.label,
        active: item.active,
        link: stats
          ? { id: String(stats.link._id), shortCode: stats.link.shortCode, shortUrl: stats.link.shortUrl, isActive: stats.link.isActive }
          : null,
        clicks,
        uniqueVisitors: stats ? stats.analytics.uniqueVisitors : null,
        clickGrowth: stats ? stats.analytics.clickGrowth : null,
        shareOfItemClicks: clicks === null ? null : toPercent(clicks, totalItemClicks),
      };
    });

  res.status(200).json({
    success: true,
    bioPage: { slug: page.slug, title: page.title || '' },
    timeRange: timeInfo.timeRange,
    views: {
      allTime: page.viewCount,
      inRange: views.total,
      granularity: views.granularity,
      series: views.series,
    },
    totalItemClicks,
    items,
  });
};

export default { getBioPageAnalytics };
