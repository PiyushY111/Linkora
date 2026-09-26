import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { toChartSeries } from './usageHelpers';

const SUCCESS_COLOR = '#C6FF3D';
const ERROR_COLOR = '#FB7185';

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const { count, errorCount } = payload[0].payload;
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-850/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
      <p className="mb-1 font-mono text-xs font-medium text-paper-400">{label}</p>
      <p className="font-mono text-sm font-bold text-paper-100">
        {count.toLocaleString()} {count === 1 ? 'request' : 'requests'}
      </p>
      {errorCount > 0 && (
        <p className="font-mono text-xs text-rose-400">
          {errorCount.toLocaleString()} {errorCount === 1 ? 'error' : 'errors'}
        </p>
      )}
    </div>
  );
};

const RequestsOverTimeChart = ({ daily }) => {
  const series = useMemo(() => toChartSeries(daily), [daily]);
  const hasData = series.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800 text-paper-500 ring-1 ring-ink-700">
          <BarChart3 size={22} />
        </div>
        <p className="text-sm font-medium text-paper-300">No requests in this period</p>
        <p className="mt-1 max-w-xs text-xs text-paper-500">
          Requests made with this API key will appear here within a few seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#212124" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#6B6B76"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis stroke="#6B6B76" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#212124' }} />
          <Bar dataKey="successCount" stackId="requests" fill={SUCCESS_COLOR} />
          <Bar dataKey="errorCount" stackId="requests" fill={ERROR_COLOR} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RequestsOverTimeChart;
