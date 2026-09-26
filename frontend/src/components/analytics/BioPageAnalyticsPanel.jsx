import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Eye, MousePointerClick, Contact, AlertCircle, RefreshCw, EyeOff } from 'lucide-react';
import StatCard from '../ui/StatCard';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ClicksOverTimeChart from './ClicksOverTimeChart';
import { analyticsService } from '../../services';

const VIEW_UNIT = { singular: 'view', plural: 'views' };

function useBioPageAnalytics(workspaceId, queryParams, refreshKey) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const paramsKey = JSON.stringify(queryParams);

  useEffect(() => {
    if (!workspaceId) return undefined;
    let isCancelled = false;
    setState((prev) => ({ ...prev, status: prev.data ? 'refreshing' : 'loading', error: null }));

    analyticsService
      .getBioPageAnalytics(workspaceId, JSON.parse(paramsKey))
      .then((data) => {
        if (!isCancelled) setState({ status: 'ready', data, error: null });
      })
      .catch((err) => {
        if (isCancelled) return;
        if (err.response?.status === 404) {
          setState({ status: 'missing', data: null, error: null });
          return;
        }
        setState({ status: 'error', data: null, error: err.response?.data?.message || 'Failed to load bio page analytics' });
      });

    return () => {
      isCancelled = true;
    };
  }, [workspaceId, paramsKey, refreshKey]);

  return state;
}

// Why an item isn't on the public page right now, if it isn't.
function hiddenNote(item) {
  if (!item.link) return 'Link no longer in this workspace';
  if (!item.active) return 'Hidden from page';
  if (!item.link.isActive) return 'Link paused';
  return null;
}

const ItemClicksTable = ({ items, totalItemClicks }) => (
  <div className="panel p-5">
    <div className="mb-4 border-b border-ink-700/60 pb-3">
      <h3 className="text-sm font-semibold tracking-tight text-paper-100">Clicks by item</h3>
      <p className="text-xs text-paper-500">
        Each item&apos;s short link, counted by the normal click pipeline. This includes clicks on that link from
        anywhere it&apos;s shared, not only from your bio page.
      </p>
    </div>
    {items.length === 0 ? (
      <p className="py-8 text-center text-sm text-paper-500">Your bio page has no links yet.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-950/60 font-semibold uppercase tracking-wider text-paper-400">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">Clicks</th>
              <th className="px-4 py-3 w-1/3">% of item clicks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {items.map((item) => {
              const note = hiddenNote(item);
              return (
                <tr key={item.itemId} className="transition-colors hover:bg-ink-800/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-paper-100">{item.label}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-paper-500">
                      {item.link ? `/${item.link.shortCode}` : '—'}
                      {note && (
                        <span className="inline-flex items-center gap-1 font-sans text-amber-300">
                          <EyeOff size={11} />
                          {note}
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-paper-100">
                    {item.clicks === null ? '—' : item.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {item.shareOfItemClicks === null ? (
                      <span className="text-paper-500">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                          <div className="h-full rounded-full bg-accent-400" style={{ width: `${item.shareOfItemClicks}%` }} />
                        </div>
                        <span className="w-12 text-right font-mono text-paper-300">{item.shareOfItemClicks}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-700 font-semibold text-paper-300">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right font-mono">{totalItemClicks.toLocaleString()}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    )}
  </div>
);

const PanelSkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
    <Skeleton className="h-80 rounded-2xl" />
    <Skeleton className="h-64 rounded-2xl" />
  </div>
);

/**
 * The workspace's bio page: views over the selected range and each item's
 * link clicks. Shares the analytics page's time range and bot filter.
 */
const BioPageAnalyticsPanel = ({ workspaceId, queryParams, refreshKey, onRetry }) => {
  const { status, data, error } = useBioPageAnalytics(workspaceId, queryParams, refreshKey);

  if (status === 'loading') return <PanelSkeleton />;

  if (status === 'missing') {
    return (
      <EmptyState
        icon={Contact}
        title="No bio page yet"
        description="Create a link-in-bio page to see its views and which links people click."
        action={
          <RouterLink to="/bio" className="btn-primary">
            Set up your bio page
          </RouterLink>
        }
      />
    );
  }

  if (status === 'error') {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load bio page analytics"
        description={error}
        action={
          <button type="button" onClick={onRetry} className="btn-secondary inline-flex items-center gap-1.5">
            <RefreshCw size={12} />
            Retry
          </button>
        }
      />
    );
  }

  const { views, items, totalItemClicks, bioPage } = data;
  const chartData = views.series.map(({ day, views: count }) => ({ day, clicks: count }));

  return (
    <div className={`space-y-6 transition-opacity ${status === 'refreshing' ? 'opacity-70' : ''}`}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Page views" value={views.inRange} icon={Eye} accent subtext="In the selected range" />
        <StatCard label="All-time views" value={views.allTime} icon={Eye} subtext={`/b/${bioPage.slug}`} />
        <StatCard label="Item clicks" value={totalItemClicks} icon={MousePointerClick} subtext="In the selected range" />
      </div>

      <ClicksOverTimeChart
        data={chartData}
        granularity={views.granularity}
        totalClicks={views.inRange}
        title="Page views"
        unit={VIEW_UNIT}
        emptyTitle="No page views in this period"
        emptyDescription="Share your bio page link, or widen the date range. Views are counted per day (UTC)."
      />

      <ItemClicksTable items={items} totalItemClicks={totalItemClicks} />
    </div>
  );
};

export default BioPageAnalyticsPanel;
