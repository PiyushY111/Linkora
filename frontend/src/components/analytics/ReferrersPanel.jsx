import { useMemo } from 'react';
import { ExternalLink, Globe, Compass } from 'lucide-react';

function getCategory(domain) {
  if (!domain || domain.toLowerCase().includes('direct')) {
    return { name: 'Direct', color: 'bg-ink-700 text-paper-300 border-ink-600' };
  }
  const d = domain.toLowerCase();
  if (
    d.includes('twitter') ||
    d.includes('t.co') ||
    d.includes('x.com') ||
    d.includes('linkedin') ||
    d.includes('facebook') ||
    d.includes('instagram') ||
    d.includes('reddit') ||
    d.includes('youtube') ||
    d.includes('tiktok') ||
    d.includes('threads')
  ) {
    return { name: 'Social', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
  }
  if (
    d.includes('google') ||
    d.includes('bing') ||
    d.includes('duckduckgo') ||
    d.includes('yahoo') ||
    d.includes('baidu') ||
    d.includes('yandex')
  ) {
    return { name: 'Search', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' };
  }
  return { name: 'Referral', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
}

export default function ReferrersPanel({ referrers = [], totalClicks = 0 }) {
  const maxClicks = useMemo(() => {
    if (!referrers || referrers.length === 0) return 1;
    return Math.max(...referrers.map((r) => r.clicks), 1);
  }, [referrers]);

  return (
    <div className="panel p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-ink-700/60 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Compass size={16} className="text-accent-400" />
            <h3 className="text-sm font-semibold tracking-tight text-paper-100">Top Referrers</h3>
          </div>
          <span className="text-xs text-paper-500">
            {referrers.length} {referrers.length === 1 ? 'source' : 'sources'}
          </span>
        </div>

        {(!referrers || referrers.length === 0) ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-paper-500 ring-1 ring-ink-700 mb-2">
              <Globe size={18} />
            </div>
            <p className="text-xs font-medium text-paper-400">No referrer sources recorded</p>
            <p className="mt-1 text-[11px] text-paper-500">
              Clicks will appear here with domain categorization.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {referrers.slice(0, 7).map((item, idx) => {
              const category = getCategory(item.referrer);
              const percentage = totalClicks > 0 ? Math.round((item.clicks / totalClicks) * 100) : 0;
              const barWidth = Math.max(Math.round((item.clicks / maxClicks) * 100), 4);
              const isDirect = category.name === 'Direct';

              return (
                <div key={idx} className="group relative">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="font-mono text-[11px] text-paper-500 w-4">{idx + 1}.</span>
                      <span className="truncate font-medium text-paper-200 group-hover:text-paper-100 transition-colors">
                        {item.referrer}
                      </span>
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-medium border ${category.color}`}
                      >
                        {category.name}
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
                      className={`h-full rounded-full transition-all duration-500 ${
                        isDirect
                          ? 'bg-ink-600'
                          : category.name === 'Social'
                          ? 'bg-purple-500'
                          : category.name === 'Search'
                          ? 'bg-sky-400'
                          : 'bg-accent-400'
                      }`}
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
