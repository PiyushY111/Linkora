import { useState, useMemo } from 'react';
import { Target, Layers, Share2, Tag } from 'lucide-react';

export default function UtmAttributionPanel({
  campaigns = [],
  sources = [],
  mediums = [],
}) {
  const [activeTab, setActiveTab] = useState('campaigns');

  const currentList = useMemo(() => {
    if (activeTab === 'campaigns') return campaigns || [];
    if (activeTab === 'sources') return sources || [];
    return mediums || [];
  }, [activeTab, campaigns, sources, mediums]);

  const totalTabClicks = useMemo(() => {
    return currentList.reduce((acc, curr) => acc + curr.clicks, 0);
  }, [currentList]);

  const maxClicks = useMemo(() => {
    if (currentList.length === 0) return 1;
    return Math.max(...currentList.map((i) => i.clicks), 1);
  }, [currentList]);

  const hasAnyUtmData =
    (campaigns && campaigns.length > 0) ||
    (sources && sources.length > 0) ||
    (mediums && mediums.length > 0);

  return (
    <div className="panel p-5 flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-accent-400" />
            <h3 className="text-sm font-semibold tracking-tight text-paper-100">UTM Attribution</h3>
          </div>

          {/* Sub-tabs */}
          <div className="inline-flex rounded-lg bg-ink-800 p-0.5 border border-ink-700 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('campaigns')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'campaigns'
                  ? 'bg-accent-400 text-ink-950 font-semibold shadow-sm'
                  : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              Campaigns ({campaigns?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sources')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'sources'
                  ? 'bg-accent-400 text-ink-950 font-semibold shadow-sm'
                  : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              Sources ({sources?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mediums')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'mediums'
                  ? 'bg-accent-400 text-ink-950 font-semibold shadow-sm'
                  : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              Mediums ({mediums?.length || 0})
            </button>
          </div>
        </div>

        {!hasAnyUtmData ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-paper-500 ring-1 ring-ink-700 mb-2">
              <Tag size={18} />
            </div>
            <p className="text-xs font-medium text-paper-300">No UTM parameters tracked</p>
            <p className="mt-1 text-[11px] text-paper-500 max-w-xs">
              Append <code className="text-accent-400 font-mono">?utm_source=...</code> to your link to automatically attribute incoming marketing traffic.
            </p>
          </div>
        ) : currentList.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <p className="text-xs text-paper-400">No {activeTab} recorded in this timeframe.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentList.slice(0, 6).map((item, idx) => {
              const barWidth = Math.max(Math.round((item.clicks / maxClicks) * 100), 4);
              const percentage = totalTabClicks > 0 ? Math.round((item.clicks / totalTabClicks) * 100) : 0;

              return (
                <div key={idx} className="group">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="font-mono text-[11px] text-paper-500 w-4">{idx + 1}.</span>
                      <span className="truncate font-mono text-paper-200 group-hover:text-paper-100 font-medium">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-xs font-semibold text-paper-100 tabular-nums">
                        {item.clicks.toLocaleString()}
                      </span>
                      <span className="font-mono text-[11px] text-paper-500 w-8 text-right tabular-nums">
                        {percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Visual Bar */}
                  <div className="h-1.5 w-full rounded-full bg-ink-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-400 to-lime-300 transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
