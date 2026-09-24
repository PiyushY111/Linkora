import { Share2 } from 'lucide-react';

/** The OpenGraph card preview; renders nothing when none is set. */
export default function SocialPreviewCard({ link }) {
  if (!(link.ogTitle || link.ogImage || link.ogDescription)) return null;

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
          {link.ogDescription && (
            <div className="text-[11px] text-paper-400 line-clamp-2">{link.ogDescription}</div>
          )}
        </div>
      </div>
    </div>
  );
}
