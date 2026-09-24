import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Zap, Database } from 'lucide-react';
import toast from 'react-hot-toast';
import { developerService } from '../../services';

export default function CacheArchitectureViewer() {
  const [diagnostics, setDiagnostics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDiagnostics = async () => {
    try {
      setIsLoading(true);
      const res = await developerService.getCacheDiagnostics();
      if (res.success) {
        setDiagnostics(res.diagnostics);
      }
    } catch {
      toast.error('Failed to load cache diagnostics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="rounded-2xl border border-accent-400/25 bg-accent-400/5 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-400/30 bg-accent-400/10 px-2.5 py-0.5 text-[10px] font-mono font-medium text-accent-400">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-ping" />
                Optimal Cache Resiliency
              </span>
              <span className="text-xs font-mono text-paper-400">• Multi-Tier Redis 7</span>
            </div>
            <h2 className="text-lg font-bold text-paper-100">
              Probabilistic Early Expiration (XFetch) & Thundering Herd Defense
            </h2>
            <p className="text-xs text-paper-400 max-w-2xl leading-relaxed">
              Standard Redis caching suffers from cache stampedes when hot keys expire simultaneously.
              Linkora implements the optimal academic <strong>XFetch algorithm</strong>, which triggers
              probabilistic background recomputation before expiration while serving 0ms-latency cache
              hits to clients.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchDiagnostics}
            disabled={isLoading}
            className="btn-secondary btn-sm self-start sm:self-center shrink-0"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-accent-400' : ''} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              Cache Hit Ratio
            </span>
            <Zap size={14} className="text-accent-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2 font-mono text-2xl font-bold text-accent-400">
            {diagnostics?.hitRatio ?? 100}%
          </div>
          <p className="mt-1 text-[11px] text-paper-500 font-mono">
            {diagnostics?.hits?.toLocaleString() ?? 0} hits / {diagnostics?.misses?.toLocaleString() ?? 0} misses
          </p>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              Early Recomputations
            </span>
            <RefreshCw size={14} className="text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2 font-mono text-2xl font-bold text-paper-100">
            {diagnostics?.earlyRefreshes ?? 0}
          </div>
          <p className="mt-1 text-[11px] text-paper-500">
            XFetch background triggers
          </p>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              Stampedes Prevented
            </span>
            <ShieldCheck size={14} className="text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2 font-mono text-2xl font-bold text-emerald-400">
            {diagnostics?.stampedesAvoided ?? 0}
          </div>
          <p className="mt-1 text-[11px] text-paper-500">
            Thundering herds eliminated
          </p>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              Redis Memory & Keys
            </span>
            <Database size={14} className="text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-100">
            {diagnostics?.redisStats?.usedMemory ?? 'Active'}
          </div>
          <p className="mt-1 text-[11px] text-paper-500 font-mono">
            {diagnostics?.redisStats?.totalKeys ?? 0} active keys in cache
          </p>
        </div>
      </div>

      {/* Academic Algorithm Specification Card */}
      <div className="panel p-5 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-paper-300">
          Mathematical Formulation & Proof
        </h4>
        <div className="rounded-xl border border-ink-800 bg-ink-950 p-4 font-mono text-xs text-paper-300 space-y-2">
          <p className="text-accent-400 font-bold">
            Condition: Δ * β * (-ln(rand)) &gt;= remainingTTL
          </p>
          <ul className="text-paper-400 space-y-1 text-[11px] list-disc list-inside">
            <li><strong>Δ (computeDelta):</strong> Time taken by the system to compute/fetch data from MongoDB (~25ms).</li>
            <li><strong>β (beta):</strong> Aggressiveness multiplier (configured at 1.0).</li>
            <li><strong>rand:</strong> Uniform random floating-point variable in (0, 1].</li>
            <li><strong>-ln(rand):</strong> Exponential distribution with mean 1. As remainingTTL approaches 0, the probability of background recomputation smoothly scales to 1.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
