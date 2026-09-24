import { Link as RouterLink } from 'react-router-dom';
import { Split, ExternalLink } from 'lucide-react';

/** The A/B variants of a split link; renders nothing for a direct link. */
export default function AbSplitCard({ link }) {
  if (!(link.routingType === 'ab_test' && Array.isArray(link.variants) && link.variants.length > 0)) return null;

  return (
    <div className="panel p-4 space-y-3 border-accent-400/25 bg-accent-400/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Split size={16} className="text-accent-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-paper-200">
            A/B Traffic Split Experiment
          </span>
        </div>
        <RouterLink
          to={`/analytics/${link._id}`}
          className="text-[11px] font-semibold text-accent-400 hover:underline flex items-center gap-1"
        >
          <span>View Stats</span>
          <ExternalLink size={11} />
        </RouterLink>
      </div>

      <div className="space-y-2">
        {link.variants.map((v) => (
          <div
            key={v.id}
            className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-900/80 px-3 py-2 text-xs"
          >
            <div className="min-w-0 pr-2">
              <div className="font-semibold text-paper-200">{v.name}</div>
              <div className="truncate text-[11px] font-mono text-paper-400">{v.url}</div>
            </div>
            <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
              <span className="text-accent-400 font-bold">{v.weight}% weight</span>
              <span className="text-paper-400">({v.clicks || 0} clicks)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
