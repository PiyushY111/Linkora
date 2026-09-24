import { Link as RouterLink } from 'react-router-dom';
import { BarChart3, Users } from 'lucide-react';

/** Total clicks, last access, and click-quota progress. */
export default function PerformanceCard({ link }) {
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-paper-400">
          Performance Summary
        </span>
        <RouterLink
          to={`/analytics/${link._id}`}
          className="flex items-center gap-1 text-xs font-semibold text-accent-400 hover:underline"
        >
          <span>Full Analytics</span>
          <BarChart3 size={13} />
        </RouterLink>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="rounded-lg bg-ink-800 p-3">
          <span className="text-[11px] text-paper-500">Total Clicks</span>
          <p className="font-mono text-xl font-bold text-paper-100 mt-0.5">
            {link.clicks ?? 0}
          </p>
        </div>
        <div className="rounded-lg bg-ink-800 p-3">
          <span className="text-[11px] text-paper-500">Last Accessed</span>
          <p className="text-xs font-medium text-paper-300 mt-1 truncate">
            {link.lastAccessedAt
              ? new Date(link.lastAccessedAt).toLocaleDateString()
              : 'Never'}
          </p>
        </div>
      </div>

      {/* Click Quota Progress Bar */}
      {link.maxClicks && link.maxClicks > 0 && (
        <div className="rounded-lg border border-ink-700 bg-ink-950/70 p-3 space-y-2 mt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-paper-300">
              <Users size={13} className="text-accent-400" />
              <span>Click Quota</span>
            </span>
            <span className="font-mono text-paper-200">
              {link.clicks ?? 0} / {link.maxClicks} opens (
              {Math.min(
                100,
                Math.round(((link.clicks || 0) / link.maxClicks) * 100)
              )}
              %)
            </span>
          </div>

          {/* Bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
            <div
              className={`h-full transition-all duration-300 ${
                (link.clicks || 0) >= link.maxClicks
                  ? 'bg-danger'
                  : (link.clicks || 0) / link.maxClicks >= 0.8
                  ? 'bg-warning'
                  : 'bg-accent-400'
              }`}
              style={{
                width: `${Math.min(
                  100,
                  Math.round(((link.clicks || 0) / link.maxClicks) * 100)
                )}%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-paper-500">
            <span>
              {(link.clicks || 0) >= link.maxClicks ? (
                <span className="text-danger font-semibold">
                  Limit reached — link expired
                </span>
              ) : (
                `${Math.max(0, link.maxClicks - (link.clicks || 0))} opens remaining`
              )}
            </span>
            <span>Target: {link.maxClicks} max</span>
          </div>
        </div>
      )}
    </div>
  );
}
