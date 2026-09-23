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
  Globe,
  ChevronDown,
  ShieldCheck,
  Split,
  Sparkles,
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
  const [excludeBots, setExcludeBots] = useState(false);

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
          excludeBots: excludeBots ? 'true' : undefined,
        };

        if (linkId === 'all') {
          const data = await analyticsService.getAnalyticsSummary(queryParams);
          setAnalytics(data.summary);
          setRecentClicks(data.summary?.recentClicks || []);
        } else {
          const data = await analyticsService.getLinkAnalytics(linkId, queryParams);
          setAnalytics({
            ...data.analytics,
            abTestAnalysis: data.abTestAnalysis,
            routingType: data.routingType,
          });
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
    [linkId, timeRange, customStart, customEnd, excludeBots]
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
        {/* Executive Header Toolbar */}
        <div className="mb-6 flex flex-col gap-4 border-b border-ink-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-400/10 text-accent-400 ring-1 ring-accent-400/25 shadow-inner">
              <Activity size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-paper-100">
                  Analytics Engine
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850 px-2.5 py-0.5 text-[10px] font-mono font-medium text-paper-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ClickHouse Columnar
                </span>
              </div>
              <p className="mt-0.5 text-xs text-paper-400">
                Real-time telemetry, period-over-period intelligence & marketing attribution.
              </p>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Styled Link Selector */}
            <div className="flex h-9 w-full sm:w-auto items-center gap-2 rounded-xl border border-ink-700 bg-ink-850/90 px-3 shadow-sm transition-colors hover:border-ink-600 focus-within:border-accent-400 focus-within:ring-1 focus-within:ring-accent-400">
              <Globe size={14} className="text-accent-400 shrink-0" />
              <select
                value={linkId}
                onChange={(e) => navigate(`/analytics/${e.target.value}`)}
                className="h-full w-full sm:w-60 bg-transparent text-xs font-medium text-paper-100 outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-ink-900 text-paper-100">
                  All Links (Global Overview)
                </option>
                {links.map((link) => (
                  <option key={link._id} value={link._id} className="bg-ink-900 text-paper-100">
                    {link.title ? `${link.title} (/${link.shortCode})` : `/${link.shortCode}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Bot Shield Filter Toggle */}
            <button
              type="button"
              onClick={() => setExcludeBots((prev) => !prev)}
              className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all cursor-pointer ${
                excludeBots
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                  : 'border-ink-700 bg-ink-850/90 text-paper-400 hover:border-ink-600 hover:text-paper-200'
              }`}
              title="Filter out automated social crawlers (Twitterbot, Slackbot) and scrapers"
            >
              <ShieldCheck size={14} className={excludeBots ? 'text-emerald-400' : 'text-paper-400'} />
              <span>{excludeBots ? 'Bot Filter On' : 'Filter Bots'}</span>
              {analytics?.botBreakdown?.botClicks > 0 && (
                <span className="rounded-full bg-ink-800 px-1.5 py-0.5 text-[10px] font-mono text-paper-400">
                  {analytics.botBreakdown.botClicks}
                </span>
              )}
            </button>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={isExporting}
              className="btn-primary inline-flex h-9 items-center gap-2 px-3.5 text-xs font-semibold shadow-lg shadow-accent-400/10 hover:shadow-accent-400/20 transition-all cursor-pointer"
            >
              <Download size={13} className={isExporting ? 'animate-bounce' : ''} />
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          </div>
        </div>

        {/* Dedicated Control & Filter Deck */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-750 bg-ink-850/70 p-2 backdrop-blur-md shadow-sm">
          {/* Left: Time Range Segmented Control */}
          <div className="flex items-center gap-2">
            <TimeRangePicker
              value={timeRange}
              onChange={handleTimeRangeChange}
              customStart={customStart}
              customEnd={customEnd}
            />
          </div>

          {/* Right: Live Telemetry Switch & Refresh */}
          <div className="flex items-center gap-2">
            {/* Live Auto-Refresh Toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`inline-flex h-8.5 items-center gap-2 rounded-xl px-3 text-xs font-medium border transition-all duration-200 cursor-pointer ${
                autoRefresh
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : 'border-ink-700 bg-ink-800 text-paper-400 hover:border-ink-600 hover:text-paper-200'
              }`}
              title="Automatically poll telemetry every 15 seconds"
            >
              <span className="relative flex h-2 w-2">
                {autoRefresh && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    autoRefresh ? 'bg-emerald-400' : 'bg-paper-600'
                  }`}
                />
              </span>
              <span className="font-mono text-[11px] font-semibold">
                {autoRefresh ? 'LIVE STREAMING' : 'LIVE OFF'}
              </span>
            </button>

            {/* Manual Refresh Button */}
            <button
              type="button"
              onClick={() => fetchAnalytics(true)}
              disabled={isRefreshing}
              className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-ink-700 bg-ink-800 text-paper-400 transition-colors hover:border-ink-600 hover:text-paper-100 disabled:opacity-50 cursor-pointer"
              title="Refresh telemetry"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-accent-400' : ''} />
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

            {/* Feature 3: Bot Shield & Traffic Quality Breakdown Banner */}
            {analytics?.botBreakdown && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-800 bg-ink-900/60 px-4 py-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                  <span className="font-semibold text-paper-200">Traffic Quality & Bot Telemetry:</span>
                  <span className="text-paper-400">
                    <strong className="text-paper-100 font-mono">{analytics.botBreakdown.humanClicks ?? analytics.totalClicks}</strong> Human clicks ({(100 - (analytics.botBreakdown.botPercentage || 0)).toFixed(1)}%) vs{' '}
                    <strong className="text-paper-100 font-mono">{analytics.botBreakdown.botClicks ?? 0}</strong> Crawlers/Scrapers ({analytics.botBreakdown.botPercentage || 0}%)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-paper-400">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Human
                  </span>
                  <span className="inline-flex items-center gap-1 ml-2">
                    <span className="h-2 w-2 rounded-full bg-ink-600" /> Bot/Crawler
                  </span>
                </div>
              </div>
            )}

            {/* Feature 2: A/B Experimentation Studio Card */}
            {analytics?.abTestAnalysis?.hasTest && (
              <div className="panel p-6 space-y-5 border-accent-400/25">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-700 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-400/10 text-accent-400 ring-1 ring-accent-400/25">
                      <Split size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-paper-100">
                          A/B Traffic Split & Statistical Significance
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-semibold ${
                            analytics.abTestAnalysis.isSignificant
                              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : analytics.abTestAnalysis.status === 'inconclusive'
                              ? 'border border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                              : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              analytics.abTestAnalysis.isSignificant ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                            }`}
                          />
                          {analytics.abTestAnalysis.statusText}
                        </span>
                      </div>
                      <p className="text-xs text-paper-400 mt-0.5">
                        Two-Proportion Z-Test & Chi-Square (χ²) evaluation with deterministic sticky hashing.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <div className="text-[10px] uppercase text-paper-500">Confidence</div>
                      <div className="text-sm font-bold text-accent-400">
                        {analytics.abTestAnalysis.confidence}%
                      </div>
                    </div>
                    <div className="text-right border-l border-ink-700 pl-4">
                      <div className="text-[10px] uppercase text-paper-500">p-value</div>
                      <div className="text-sm font-bold text-paper-200">
                        {analytics.abTestAnalysis.pValue}
                      </div>
                    </div>
                    <div className="text-right border-l border-ink-700 pl-4">
                      <div className="text-[10px] uppercase text-paper-500">χ² Score</div>
                      <div className="text-sm font-bold text-paper-200">
                        {analytics.abTestAnalysis.chiSquare}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Side-by-Side Variant Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analytics.abTestAnalysis.variants.map((variant) => (
                    <div
                      key={variant.id}
                      className={`relative rounded-xl border p-4 transition-all ${
                        variant.isLeading && analytics.abTestAnalysis.isSignificant
                          ? 'border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                          : 'border-ink-700 bg-ink-900/60'
                      }`}
                    >
                      {variant.isLeading && (
                        <span className="absolute -top-2.5 right-4 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[9px] font-mono font-bold text-emerald-300">
                          Leading Variant
                        </span>
                      )}
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-paper-100">{variant.name}</h4>
                          <p className="text-xs text-paper-400 truncate max-w-xs mt-0.5 font-mono">
                            {variant.url}
                          </p>
                        </div>
                        <span className="rounded-lg bg-ink-800 px-2 py-1 text-xs font-mono font-semibold text-paper-300">
                          Target: {variant.weight}%
                        </span>
                      </div>

                      <div className="mt-4 flex items-end justify-between border-t border-ink-800/80 pt-3">
                        <div>
                          <div className="text-[10px] font-mono uppercase text-paper-500">Recorded Clicks</div>
                          <div className="text-xl font-bold font-mono text-paper-100 mt-0.5">
                            {variant.clicks.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-mono uppercase text-paper-500">Actual Share</div>
                          <div className="text-sm font-bold font-mono text-accent-400 mt-0.5">
                            {variant.trafficShare}%
                          </div>
                        </div>
                      </div>

                      {/* Share progress bar */}
                      <div className="mt-3 h-1.5 w-full rounded-full bg-ink-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            variant.isLeading ? 'bg-emerald-400' : 'bg-accent-400'
                          }`}
                          style={{ width: `${Math.min(100, variant.trafficShare)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary Note */}
                <div className="rounded-lg border border-ink-800 bg-ink-950/70 p-3 text-xs text-paper-300 flex items-start gap-2.5">
                  <Sparkles size={16} className="text-accent-400 shrink-0 mt-0.5" />
                  <span>{analytics.abTestAnalysis.summary}</span>
                </div>
              </div>
            )}

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
