import { Gauge, AlertTriangle } from 'lucide-react';
import Skeleton from '../../ui/Skeleton';
import { USAGE_POLL_INTERVAL_MS, capacityPercent, capacityTone } from './usageHelpers';

const TONE_STYLES = {
  ok: { bar: 'bg-accent-400', text: 'text-accent-400' },
  low: { bar: 'bg-amber-400', text: 'text-amber-400' },
  critical: { bar: 'bg-rose-400', text: 'text-rose-400' },
};

const BurstCapacityGauge = ({ usage, error }) => {
  if (!usage) {
    return error ? (
      <div className="panel flex items-center gap-2 p-5 text-xs text-rose-400 lg:col-span-2">
        <AlertTriangle size={14} className="shrink-0" />
        <span>{error}</span>
      </div>
    ) : (
      <Skeleton className="h-[132px] lg:col-span-2" />
    );
  }

  const { remainingTokens, burstCapacity, refillPerSecond } = usage.rateLimits;
  const percent = capacityPercent(remainingTokens, burstCapacity);
  const tone = TONE_STYLES[capacityTone(percent)];
  const label = `Burst capacity: ${remainingTokens} / ${burstCapacity} requests available right now`;

  return (
    <div className="panel p-5 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-paper-500">
          <Gauge size={14} className="text-paper-400" />
          <span>Burst Capacity</span>
        </div>
        <span className="font-mono text-[11px] text-paper-500">
          {usage.key?.name} · {usage.key?.prefix}…
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-1.5 font-mono">
        <span className={`text-2xl font-bold ${tone.text}`}>{remainingTokens}</span>
        <span className="text-sm text-paper-500">/ {burstCapacity} requests</span>
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={burstCapacity}
        aria-valuenow={remainingTokens}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-800"
      >
        <div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${percent}%` }} />
      </div>

      <p className="mt-2.5 text-xs text-paper-400">{label}</p>
      <p className="mt-0.5 text-[11px] text-paper-500">
        Refills at {refillPerSecond} requests/second · refreshed every {USAGE_POLL_INTERVAL_MS / 1000}s
        {error && <span className="ml-1.5 text-rose-400">· last refresh failed</span>}
      </p>
    </div>
  );
};

export default BurstCapacityGauge;
