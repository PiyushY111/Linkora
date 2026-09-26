import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Skeleton from '../../ui/Skeleton';
import BurstCapacityGauge from './BurstCapacityGauge';
import RequestsOverTimeChart from './RequestsOverTimeChart';
import TopEndpointsTable from './TopEndpointsTable';
import { useLiveUsage, useUsageHistory } from './useUsageData';
import { HISTORY_RANGE_OPTIONS, sumDaily } from './usageHelpers';

const InlineError = ({ message }) => (
  <div className="flex items-center gap-2 py-6 text-xs text-rose-400">
    <AlertTriangle size={14} className="shrink-0" />
    <span>{message}</span>
  </div>
);

const ErrorRateStat = ({ history, error }) => {
  if (error) {
    return (
      <div className="panel px-5">
        <InlineError message={error} />
      </div>
    );
  }
  if (!history) return <Skeleton className="h-[132px]" />;

  const totals = sumDaily(history.daily);
  return (
    <div className="panel p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
        Error Rate ({history.days}d)
      </div>
      <div
        className={`mt-2 font-mono text-2xl font-bold ${history.errorRate >= 5 ? 'text-amber-400' : 'text-accent-400'}`}
      >
        {history.errorRate}%
      </div>
      <p className="mt-2.5 text-xs text-paper-400">
        {totals.errorCount.toLocaleString()} of {totals.count.toLocaleString()} requests returned 4xx/5xx
      </p>
    </div>
  );
};

const RangeToggle = ({ days, onChange }) => (
  <div className="inline-flex rounded-lg border border-ink-700 bg-ink-950 p-0.5">
    {HISTORY_RANGE_OPTIONS.map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        aria-pressed={days === option}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          days === option ? 'bg-ink-800 text-paper-100 shadow-sm' : 'text-paper-400 hover:text-paper-200'
        }`}
      >
        {option} days
      </button>
    ))}
  </div>
);

/**
 * Live burst capacity plus request history for one API key. Mount with
 * `key={apiKey}` so switching keys resets all state.
 */
const UsageDashboard = ({ apiKey }) => {
  const [days, setDays] = useState(HISTORY_RANGE_OPTIONS[0]);
  const { usage, error: usageError } = useLiveUsage(apiKey);
  const { history, error: historyError, isLoading: isHistoryLoading } = useUsageHistory(apiKey, days);

  const renderHistory = (render) => {
    if (historyError) return <InlineError message={historyError} />;
    if (isHistoryLoading && !history) return <Skeleton className="h-64" />;
    return render(history);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <BurstCapacityGauge usage={usage} error={usageError} />
        <ErrorRateStat history={history} error={historyError} />
      </div>

      <div className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 pb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-paper-100">Requests Over Time</h3>
            <p className="text-xs text-paper-500">Daily requests (UTC), with failed requests stacked in red.</p>
          </div>
          <RangeToggle days={days} onChange={setDays} />
        </div>
        <div className={isHistoryLoading && history ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {renderHistory((h) => <RequestsOverTimeChart daily={h.daily} />)}
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-4 border-b border-ink-700/60 pb-3">
          <h3 className="text-sm font-semibold tracking-tight text-paper-100">Top Endpoints</h3>
          <p className="text-xs text-paper-500">Most-called endpoints over the last {history?.days ?? days} days.</p>
        </div>
        {renderHistory((h) => <TopEndpointsTable endpoints={h.topEndpoints} />)}
      </div>
    </div>
  );
};

export default UsageDashboard;
