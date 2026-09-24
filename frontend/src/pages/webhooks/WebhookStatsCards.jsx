import { CheckCircle2 } from 'lucide-react';

/** Endpoint count, active count, 24h success rate, and degraded/paused counts. */
export default function WebhookStatsCards({ stats }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="panel p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
          Total Endpoints
        </div>
        <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-100">
          {stats.total}
        </div>
      </div>

      <div className="panel p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
          Operational Status
        </div>
        <div className="mt-1 flex items-center gap-2 font-mono text-xl font-bold text-accent-400">
          <CheckCircle2 size={18} />
          <span>{stats.active} Active</span>
        </div>
      </div>

      <div className="panel p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
          24h Success Rate
        </div>
        <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-100">
          <span
            className={
              stats.avgSuccessRate >= 95
                ? 'text-accent-400'
                : stats.avgSuccessRate >= 80
                ? 'text-amber-400'
                : 'text-rose-400'
            }
          >
            {stats.avgSuccessRate}%
          </span>
          <span className="text-xs text-paper-500">
            ({stats.total24hDeliveries} sends)
          </span>
        </div>
      </div>

      <div className="panel p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
          Degraded / Paused
        </div>
        <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-300">
          <span className={stats.degraded > 0 ? 'text-amber-400' : 'text-paper-300'}>
            {stats.degraded} degraded
          </span>
          {stats.disabled > 0 && (
            <span className="text-xs text-paper-500">
              / {stats.disabled} paused
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
