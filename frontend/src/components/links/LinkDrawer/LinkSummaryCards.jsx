import { ExternalLink, Split, Share2 } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';

/** Read-only A/B split configuration. */
export function AbTestSummary({ link }) {
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

/** Read-only OpenGraph preview card. */
export function SocialPreviewSummary({ link }) {
  return (
    <div className="panel p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <Share2 size={15} className="text-accent-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-paper-300">
          Social OpenGraph Preview Card
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900 text-xs">
        {link.ogImage && (
          <img
            src={link.ogImage}
            alt="Social Preview"
            className="h-28 w-full object-cover border-b border-ink-800"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="p-3 space-y-1">
          <div className="font-bold text-paper-100 truncate">{link.ogTitle || link.title}</div>
          {link.ogDescription && <div className="text-[11px] text-paper-400 line-clamp-2">{link.ogDescription}</div>}
        </div>
      </div>
    </div>
  );
}
