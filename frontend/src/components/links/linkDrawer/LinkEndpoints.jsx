import { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Check, ExternalLink } from 'lucide-react';

/** The short URL with copy, and the destination (editable while editing). */
export default function LinkEndpoints({ link, isEditing, originalUrl, setOriginalUrl }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(link.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  return (
    <>
      {/* Short URL Box */}
      <div className="rounded-xl border border-ink-700 bg-ink-950 p-3.5 space-y-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-paper-500">
          Shortened Endpoint
        </span>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-sm font-semibold text-accent-400">
            {link.shortUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="btn-primary btn-sm shrink-0"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Destination URL */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-paper-500">
            Original Destination
          </span>
          {isEditing && (
            <span className="text-[10px] text-accent-400">Editable</span>
          )}
        </div>
        {isEditing ? (
          <input
            type="url"
            required
            value={originalUrl}
            onChange={(e) => setOriginalUrl(e.target.value)}
            placeholder="https://yourcompany.com/landing-page"
            className="input font-mono text-xs"
          />
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-800/60 p-3">
            <span className="truncate text-xs font-mono text-paper-300">
              {link.originalUrl}
            </span>
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
