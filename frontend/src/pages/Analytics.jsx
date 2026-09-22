import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  TrendingUp,
  Users,
  Monitor,
  Compass,
  Download,
  RefreshCw,
  Activity,
  Layers,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import StatCard from '../components/ui/StatCard';
import Skeleton from '../components/ui/Skeleton';
import TimeRangePicker from '../components/analytics/TimeRangePicker';
import ClicksOverTimeChart from '../components/analytics/ClicksOverTimeChart';
import ReferrersPanel from '../components/analytics/ReferrersPanel';
import GeoLocationPanel from '../components/analytics/GeoLocationPanel';
import DevicesAndClientsPanel from '../components/analytics/DevicesAndClientsPanel';
import UtmAttributionPanel from '../components/analytics/UtmAttributionPanel';
import RealtimeClickStream from '../components/analytics/RealtimeClickStream';
import { analyticsService, linkService } from '../services';

const Analytics = () => {
  const { linkId = 'all' } = useParams();
  const navigate = useNavigate();

  const [timeRange, setTimeRange] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [analytics, setAnalytics] = useState(null);
  const [recentClicks, setRecentClicks] = useState([]);
  const [links, setLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch analytics dataset
  const fetchAnalytics = useCallback(
    async (background = false) => {
      if (!background) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const queryParams = {
          timeRange,
          startDate: customStart || undefined,
          endDate: customEnd || undefined,
        };

        if (linkId === 'all') {
          const data = await analyticsService.getAnalyticsSummary(queryParams);
          setAnalytics(data.summary);
          setRecentClicks(data.summary?.recentClicks || []);
        } else {
          const data = await analyticsService.getLinkAnalytics(linkId, queryParams);
          setAnalytics(data.analytics);
          setRecentClicks(data.recentClicks || []);
        }
      } catch (err) {
        if (!background) {
          toast.error('Failed to load analytics data');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [linkId, timeRange, customStart, customEnd]
  );

  // Initial and reactive fetch
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Load user links for switcher dropdown
  useEffect(() => {
    linkService
      .getLinks(1, 100)
      .then((data) => setLinks(data.links || []))
      .catch(() => {});
  }, []);

  // Auto-refresh interval (15 seconds when active)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAnalytics(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAnalytics]);

  // Time range handler
  const handleTimeRangeChange = ({ timeRange: tr, startDate, endDate }) => {
    setTimeRange(tr);
    if (startDate) setCustomStart(startDate);
    if (endDate) setCustomEnd(endDate);
  };

  // CSV Export handler
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const exportParams = {
        timeRange,
        startDate: customStart || undefined,
        endDate: customEnd || undefined,
        linkId: linkId === 'all' ? undefined : linkId,
      };

      const blobData = await analyticsService.exportAnalytics(exportParams);
      const url = window.URL.createObjectURL(new Blob([blobData]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `linkly-analytics-${linkId}-${timeRange}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Analytics CSV export downloaded');
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const selectedLink = links.find((l) => l._id === linkId);

  return (
    <>
      <Helmet>
        <title>Analytics Engine — Linkly Enterprise</title>
      </Helmet>
      <AppShell>
        {/* Header Toolbar */}
        <div className="mb-6 flex flex-col gap-4 border-b border-ink-800 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400 ring-1 ring-accent-400/30">
                <Activity size={14} />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-paper-100">
                Analytics Engine
              </h1>
              <span className="rounded-md bg-ink-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-paper-400 border border-ink-700">
                ClickHouse
              </span>
            </div>
            <p className="mt-1 text-xs text-paper-400">
              High-throughput columnar event ingestion with period-over-period intelligence.
            </p>
          </div>

          {/* Right Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Link Selector */}
            <div className="w-full sm:w-auto">
              <select
                value={linkId}
                onChange={(e) => navigate(`/analytics/${e.target.value}`)}
                className="input py-1.5 text-xs w-full sm:w-60 font-medium"
              >
                <option value="all">🌐 All Links (Global Overview)</option>
                {links.map((link) => (
                  <option key={link._id} value={link._id}>
                    {link.title ? `${link.title} (/${link.shortCode})` : `/${link.shortCode}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Time Range Selector */}
            <TimeRangePicker
              value={timeRange}
              onChange={handleTimeRangeChange}
              customStart={customStart}
              customEnd={customEnd}
            />

            {/* Live Auto-Refresh Toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors ${
                autoRefresh
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-ink-700 bg-ink-800 text-paper-400 hover:text-paper-200'
              }`}
              title="Automatically refresh every 15 seconds"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-paper-600'
                }`}
              />
              <span>Live {autoRefresh ? 'ON' : 'OFF'}</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              type="button"
              onClick={() => fetchAnalytics(true)}
              disabled={isRefreshing}
              className="btn-ghost p-2 text-paper-400 hover:text-paper-100"
              title="Refresh data"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-accent-400' : ''} />
            </button>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={isExporting}
              className="btn-primary inline-flex items-center gap-1.5 py-1.5 px-3 text-xs"
            >
              <Download size={13} className={isExporting ? 'animate-bounce' : ''} />
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          </div>
        </div>

        {/* Selected Link Metadata Banner (if specific link chosen) */}
        {linkId !== 'all' && selectedLink && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-850/60 px-4 py-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono font-semibold text-accent-400">/{selectedLink.shortCode}</span>
              <span className="text-paper-500">•</span>
              <span className="truncate text-paper-300 max-w-md">{selectedLink.originalUrl}</span>
            </div>
            <div className="flex items-center gap-3 text-paper-400 font-mono text-[11px]">
              <span>Created: {new Date(selectedLink.createdAt).toLocaleDateString()}</span>
              {selectedLink.maxClicks > 0 && (
                <span>Usage Cap: {selectedLink.clicks || 0} / {selectedLink.maxClicks}</span>
              )}
            </div>
          </div>
        )}

        {/* Content Loading Skeleton */}
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
              <Skeleton className="h-80 rounded-2xl" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Stat KPI Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label="Total Clicks"
                value={analytics?.totalClicks ?? 0}
                icon={TrendingUp}
                growth={analytics?.clickGrowth}
                accent
              />
              <StatCard
                label="Unique Visitors"
                value={analytics?.uniqueVisitors ?? 0}
                icon={Users}
                growth={analytics?.visitorGrowth}
              />
              <StatCard
                label="Top Device"
                value={analytics?.topDevices?.[0]?.device || 'N/A'}
                subtext={
                  analytics?.topDevices?.[0]?.clicks
                    ? `${analytics.topDevices[0].clicks.toLocaleString()} clicks`
                    : null
                }
                icon={Monitor}
              />
              <StatCard
                label="Top Referrer"
                value={analytics?.topReferrers?.[0]?.referrer || 'Direct'}
                subtext={
                  analytics?.topReferrers?.[0]?.clicks
                    ? `${analytics.topReferrers[0].clicks.toLocaleString()} clicks`
                    : null
                }
                icon={Compass}
              />
            </div>

            {/* Row 1: Clicks Over Time Chart & Top Referrers */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ClicksOverTimeChart
                  data={analytics?.clicksByDay || []}
                  granularity={analytics?.granularity || 'day'}
                  totalClicks={analytics?.totalClicks || 0}
                />
              </div>
              <div className="lg:col-span-1">
                <ReferrersPanel
                  referrers={analytics?.topReferrers || []}
                  totalClicks={analytics?.totalClicks || 0}
                />
              </div>
            </div>

            {/* Row 2: Geo Distribution & Devices / Clients */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <GeoLocationPanel
                countries={analytics?.topCountries || []}
                cities={analytics?.topCities || []}
                totalClicks={analytics?.totalClicks || 0}
              />
              <DevicesAndClientsPanel
                devices={analytics?.topDevices || []}
                operatingSystems={analytics?.topOperatingSystems || []}
                browsers={analytics?.topBrowsers || []}
                totalClicks={analytics?.totalClicks || 0}
              />
            </div>

            {/* Row 3: Marketing Attribution (UTM Parameters) */}
            <UtmAttributionPanel
              campaigns={analytics?.utmCampaigns || []}
              sources={analytics?.utmSources || []}
              mediums={analytics?.utmMediums || []}
            />

            {/* Row 4: Real-time Columnar Click Stream */}
            <RealtimeClickStream clicks={recentClicks} isLive={autoRefresh} />
          </div>
        )}
      </AppShell>
    </>
  );
};

export default Analytics;
