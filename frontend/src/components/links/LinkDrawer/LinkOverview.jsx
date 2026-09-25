import { Copy, Check, ExternalLink } from 'lucide-react';

/** The short URL box and the destination (read-only, or an input while editing). */
export default function LinkOverview({ link, copied, onCopy, isEditing, originalUrl, onOriginalUrlChange }) {
  return (
    <>
      {/* Short URL Box */}
      <div className="rounded-xl border border-ink-700 bg-ink-950 p-3.5 space-y-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-paper-500">Shortened Endpoint</span>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-sm font-semibold text-accent-400">{link.shortUrl}</span>
          <button type="button" onClick={onCopy} className="btn-primary btn-sm shrink-0">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Destination URL */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-paper-500">Original Destination</span>
          {isEditing && <span className="text-[10px] text-accent-400">Editable</span>}
        </div>
        {isEditing ? (
          <input
            type="url"
            required
            value={originalUrl}
            onChange={(e) => onOriginalUrlChange(e.target.value)}
            placeholder="https://yourcompany.com/landing-page"
            className="input font-mono text-xs"
          />
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-800/60 p-3">
            <span className="truncate text-xs font-mono text-paper-300">{link.originalUrl}</span>
            <a
              href={link.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-paper-400 hover:text-accent-400 p-1 shrink-0"
              title="Test destination"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        )}
      </div>
    </>
  );
}
