import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Globe, Monitor, Chrome, TrendingUp, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import StatCard from '../components/ui/StatCard';
import Skeleton from '../components/ui/Skeleton';
import { analyticsService, linkService } from '../services';

const CHART_COLORS = ['#C6FF3D', '#6E9BFF', '#FFB84D', '#33D17A', '#FF5C5C'];

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-xs shadow-panel">
      {label && <p className="mb-1 font-medium text-paper-300">{label}</p>}
      {payload.map((entry) => (
        <p key={entry.dataKey} className="font-mono text-paper-100">
          {entry.value}
        </p>
      ))}
    </div>
  );
};

const ChartPanel = ({ title, children }) => (
  <div className="panel p-5">
    <h3 className="mb-4 text-sm font-semibold text-paper-100">{title}</h3>
    <ResponsiveContainer width="100%" height={260}>
      {children}
    </ResponsiveContainer>
  </div>
);

const Analytics = () => {
  const { linkId } = useParams();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [recentClicks, setRecentClicks] = useState([]);
  const [links, setLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      if (linkId === 'all') {
        const data = await analyticsService.getAnalyticsSummary();
        setAnalytics(data.summary);
        setRecentClicks([]);
      } else {
        const data = await analyticsService.getLinkAnalytics(linkId);
        setAnalytics(data.analytics);
        setRecentClicks(data.recentClicks || []);
      }
    } catch {
      toast.error('Failed to fetch analytics');
    } finally {
      setIsLoading(false);
    }
  }, [linkId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    linkService
      .getLinks(1, 100)
      .then((data) => setLinks(data.links))
      .catch(() => {});
  }, []);

  return (
    <>
      <Helmet>
        <title>Analytics — Linkly</title>
      </Helmet>
      <AppShell>
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-paper-100">Analytics</h1>
            <p className="mt-1 text-sm text-paper-500">Performance across your links.</p>
          </div>
          <select
            value={linkId}
            onChange={(e) => navigate(`/analytics/${e.target.value}`)}
            className="input w-full sm:w-56"
          >
            <option value="all">All links</option>
            {links.map((link) => (
              <option key={link._id} value={link._id}>
                {link.title || link.shortCode}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Total clicks" value={analytics?.totalClicks ?? 0} icon={TrendingUp} accent />
              <StatCard label="Unique visitors" value={analytics?.uniqueVisitors ?? '—'} icon={Users} />
              <StatCard label="Top device" value={analytics?.topDevices?.[0]?.device || 'N/A'} icon={Monitor} />
              <StatCard label="Top browser" value={analytics?.topBrowsers?.[0]?.browser || 'N/A'} icon={Chrome} />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {analytics?.clicksByDay?.length > 0 && (
                <ChartPanel title="Clicks over time">
                  <LineChart data={analytics.clicksByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#212124" vertical={false} />
                    <XAxis dataKey="day" stroke="#84848F" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#84848F" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#2B2B30' }} />
                    <Line type="monotone" dataKey="clicks" stroke="#C6FF3D" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartPanel>
              )}

              {analytics?.topCountries?.length > 0 && (
                <ChartPanel title="Top countries">
                  <BarChart data={analytics.topCountries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#212124" vertical={false} />
                    <XAxis dataKey="country" stroke="#84848F" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#84848F" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="clicks" fill="#C6FF3D" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartPanel>
              )}

              {analytics?.topDevices?.length > 0 && (
                <ChartPanel title="Device distribution">
                  <PieChart>
                    <Pie data={analytics.topDevices} dataKey="clicks" nameKey="device" cx="50%" cy="50%" outerRadius={90} label>
                      {analytics.topDevices.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ChartPanel>
              )}

              {analytics?.topBrowsers?.length > 0 && (
                <ChartPanel title="Top browsers">
                  <BarChart data={analytics.topBrowsers}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#212124" vertical={false} />
                    <XAxis dataKey="browser" stroke="#84848F" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#84848F" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="clicks" fill="#6E9BFF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartPanel>
              )}
            </div>

            {recentClicks.length > 0 && (
              <div className="panel mt-6 overflow-hidden">
                <h3 className="border-b border-ink-700 px-5 py-4 text-sm font-semibold text-paper-100">
                  Recent clicks
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-paper-500">
                        <th className="px-5 py-2 font-medium">Time</th>
                        <th className="px-5 py-2 font-medium">Location</th>
                        <th className="px-5 py-2 font-medium">Device</th>
                        <th className="px-5 py-2 font-medium">Browser</th>
                        <th className="px-5 py-2 font-medium">Referrer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentClicks.map((click) => (
                        <tr key={click.event_id} className="border-t border-ink-800">
                          <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-paper-400">
                            {new Date(click.timestamp).toLocaleString()}
                          </td>
                          <td className="px-5 py-2.5 text-paper-300">
                            {[click.city, click.country_code].filter(Boolean).join(', ') || (
                              <span className="inline-flex items-center gap-1 text-paper-500">
                                <Globe size={12} /> Unknown
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-2.5 capitalize text-paper-300">{click.device_type || '—'}</td>
                          <td className="px-5 py-2.5 text-paper-300">{click.browser_family || '—'}</td>
                          <td className="px-5 py-2.5 text-paper-300">{click.referrer_domain || 'Direct'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </AppShell>
    </>
  );
};

export default Analytics;
