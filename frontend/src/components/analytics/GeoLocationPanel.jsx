import { useState, useMemo } from 'react';
import ReactCountryFlag from 'react-country-flag';
import { Globe, MapPin } from 'lucide-react';

export default function GeoLocationPanel({ countries = [], cities = [], totalClicks = 0 }) {
  const [viewMode, setViewMode] = useState('countries'); // 'countries' | 'cities'

  const activeList = viewMode === 'countries' ? countries : cities;

  const maxClicks = useMemo(() => {
    if (!activeList || activeList.length === 0) return 1;
    return Math.max(...activeList.map((i) => i.clicks), 1);
  }, [activeList]);

  return (
    <div className="panel p-5 flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-accent-400" />
            <h3 className="text-sm font-semibold tracking-tight text-paper-100">
              Geographic Distribution
            </h3>
          </div>

          <div className="inline-flex rounded-lg bg-ink-800 p-0.5 border border-ink-700 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('countries')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                viewMode === 'countries'
                  ? 'bg-accent-400 text-ink-950 font-semibold shadow-sm'
                  : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              Countries ({countries?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cities')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                viewMode === 'cities'
                  ? 'bg-accent-400 text-ink-950 font-semibold shadow-sm'
                  : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              Cities ({cities?.length || 0})
            </button>
          </div>
        </div>

        {!activeList || activeList.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-paper-500 ring-1 ring-ink-700 mb-2">
              <MapPin size={18} />
            </div>
            <p className="text-xs font-medium text-paper-300">No geographic data recorded</p>
            <p className="mt-1 text-[11px] text-paper-500">
              Clicks will be resolved to country codes and metro cities.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {activeList.slice(0, 7).map((item, idx) => {
              const countryCode = viewMode === 'countries' ? item.country : item.country;
              const title = viewMode === 'countries' ? item.country : `${item.city}, ${item.country}`;
              const barWidth = Math.max(Math.round((item.clicks / maxClicks) * 100), 4);
              const percentage = totalClicks > 0 ? Math.round((item.clicks / totalClicks) * 100) : 0;

              return (
                <div key={idx} className="group">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="font-mono text-[11px] text-paper-500 w-4">{idx + 1}.</span>
                      {countryCode && countryCode.length === 2 ? (
                        <ReactCountryFlag
                          countryCode={countryCode}
                          svg
                          style={{
                            width: '1.2em',
                            height: '1.2em',
                            borderRadius: '2px',
                          }}
                        />
                      ) : (
                        <Globe size={13} className="text-paper-500" />
                      )}
                      <span className="truncate font-medium text-paper-200 group-hover:text-paper-100 transition-colors">
                        {title}
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

                  {/* Progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-ink-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-all duration-500"
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
