import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BarChart2 } from 'lucide-react';

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null;
  const count = payload[0].value;
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-850/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
      <p className="font-mono text-xs font-medium text-paper-400 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-accent-400 animate-pulse" />
        <span className="font-mono text-sm font-bold text-paper-100">
          {Number(count).toLocaleString()} {count === 1 ? unit.singular : unit.plural}
        </span>
      </div>
    </div>
  );
};

const CLICK_UNIT = { singular: 'click', plural: 'clicks' };

/**
 * Time series of `{ day, clicks }` points. Title, unit and empty-state copy
 * default to clicks; other counts (e.g. bio page views) pass their own.
 */
export default function ClicksOverTimeChart({
  data = [],
  granularity = 'day',
  totalClicks = 0,
  title = 'Clicks Activity',
  unit = CLICK_UNIT,
  emptyTitle = 'No clicks recorded in this period',
  emptyDescription = 'Share your link or widen the selected date window to view high-resolution click streams.',
}) {
  const chartData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.map((item) => {
      let displayDay = item.day;
      if (item.day) {
        if (item.day.length > 10) {
          // 'YYYY-MM-DD HH:00' -> display as 'HH:00'
          displayDay = item.day.slice(11, 16);
        } else if (item.day.length === 10) {
          // 'YYYY-MM-DD' -> display as 'MMM d'
          try {
            const [y, m, d] = item.day.split('-');
            const date = new Date(y, m - 1, d);
            displayDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          } catch {
            displayDay = item.day;
          }
        } else if (item.day.length === 7) {
          // 'YYYY-MM' -> display as 'MMM yyyy'
          try {
            const [y, m] = item.day.split('-');
            const date = new Date(y, m - 1, 1);
            displayDay = date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
          } catch {
            displayDay = item.day;
          }
        }
      }
      return {
        ...item,
        displayLabel: displayDay,
      };
    });
  }, [data]);

  const hasData = chartData.length > 0 && chartData.some((d) => d.clicks > 0);

  return (
    <div className="panel p-5 relative">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 pb-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold tracking-tight text-paper-100">{title}</h3>
          <span className="rounded-full bg-accent-400/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-accent-400 border border-accent-400/20">
            {totalClicks.toLocaleString()} total
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-ink-800 px-2 py-0.5 text-[11px] font-medium text-paper-400 border border-ink-700">
            {granularity === 'hour'
              ? 'Hourly Resolution'
              : granularity === 'month'
              ? 'Monthly Resolution'
              : 'Daily Resolution'}
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800 text-paper-500 ring-1 ring-ink-700 mb-3">
            <BarChart2 size={22} />
          </div>
          <p className="text-sm font-medium text-paper-300">{emptyTitle}</p>
          <p className="mt-1 text-xs text-paper-500 max-w-xs">{emptyDescription}</p>
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="limeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C6FF3D" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#C6FF3D" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#212124" vertical={false} />
              <XAxis
                dataKey="displayLabel"
                stroke="#6B6B76"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#6B6B76"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ stroke: '#3E3E48', strokeDasharray: '4 4' }} />
              <Area
                type="monotone"
                dataKey="clicks"
                stroke="#C6FF3D"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#limeAreaGrad)"
                activeDot={{ r: 5, fill: '#C6FF3D', stroke: '#0E0E10', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
