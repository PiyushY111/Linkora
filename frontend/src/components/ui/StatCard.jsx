import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const StatCard = ({ label, value, icon: Icon, accent = false, growth = null, subtext = null }) => {
  const isPositive = typeof growth === 'number' && growth > 0;
  const isNegative = typeof growth === 'number' && growth < 0;
  const isNeutral = typeof growth === 'number' && growth === 0;

  const isNumeric = typeof value === 'number';
  const rawStr = String(value ?? '');
  // Clean up protocol prefixes like https:// or trailing slashes for cleaner display
  const displayStr = isNumeric ? value.toLocaleString() : rawStr.replace(/^https?:\/\//i, '').replace(/\/$/, '');

  return (
    <div className="panel p-5 relative overflow-hidden transition-all duration-200 hover:border-ink-600">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-paper-500 truncate">{label}</p>
          {isNumeric ? (
            <p
              className={`mt-2 font-mono text-3xl font-bold tabular-nums tracking-tight truncate ${
                accent ? 'text-accent-400' : 'text-paper-100'
              }`}
            >
              {displayStr}
            </p>
          ) : (
            <p
              title={rawStr}
              className={`mt-2 font-sans font-bold tracking-tight break-all line-clamp-1 hover:line-clamp-none transition-all ${
                displayStr.length > 20
                  ? 'text-base sm:text-lg'
                  : displayStr.length > 12
                  ? 'text-lg sm:text-xl'
                  : 'text-2xl'
              } ${accent ? 'text-accent-400' : 'text-paper-100'}`}
            >
              {displayStr}
            </p>
          )}
          {growth !== null && growth !== undefined && (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium shrink-0 ${
                  isPositive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : isNegative
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : 'bg-ink-700 text-paper-400 border border-ink-600'
                }`}
              >
                {isPositive && <TrendingUp size={11} />}
                {isNegative && <TrendingDown size={11} />}
                {isNeutral && <Minus size={11} />}
                {growth > 0 ? `+${growth}%` : `${growth}%`}
              </span>
              <span className="text-paper-500 text-[11px] truncate">vs prior period</span>
            </div>
          )}
          {subtext && growth === null && (
            <p className="mt-2 text-xs text-paper-500 truncate" title={subtext}>{subtext}</p>
          )}
        </div>
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-800 ring-1 ring-ink-700/80 shadow-inner">
            <Icon size={18} className={accent ? 'text-accent-400' : 'text-paper-300'} />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
