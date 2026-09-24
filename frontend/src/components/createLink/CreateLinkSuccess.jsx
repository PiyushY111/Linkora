import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Copy, Check, Download } from 'lucide-react';
import QRCodeViewer from '../qr/QRCodeViewer';
import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';

/**
 * The view shown after a link is created: the short URL with copy, its QR
 * code with download, quick-share links, and the next actions.
 */
export default function CreateLinkSuccess({ createdResult, fallbackQrConfig, onCustomizeQr, onCreateAnother, onDone }) {
  const [copied, setCopied] = useState(false);
  const successQrViewerRef = useRef(null);

  const copyShortUrl = () => {
    if (!createdResult) return;
    navigator.clipboard.writeText(createdResult.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  const downloadQr = async (format = 'png') => {
    if (successQrViewerRef.current) {
      await successQrViewerRef.current.download(
        `${createdResult?.shortCode || 'link'}-qr`,
        format,
        1024
      );
      return;
    }
    if (!createdResult?.qrCode) return;
    const a = document.createElement('a');
    a.href = createdResult.qrCode;
    a.download = `${createdResult.shortCode}-qr.${format}`;
    a.click();
  };

  return (
    <>
      <div className="rounded-xl border border-accent-400/30 bg-ink-900 p-5 shadow-glow">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-accent-400">
            Ready to share
          </span>
          <span className="badge-success text-xs">Active</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-ink-600 bg-ink-950 px-4 py-3">
          <span className="truncate font-mono text-base font-semibold text-accent-400">
            {createdResult.shortUrl}
          </span>
          <button
            type="button"
            onClick={copyShortUrl}
            className="btn-primary btn-sm shrink-0"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-paper-500">
          <span>Redirects to:</span>
          <a
            href={createdResult.originalUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate text-paper-300 hover:text-paper-100 hover:underline"
          >
            {createdResult.originalUrl}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* QR Code Card */}
        <div className="panel p-4 flex items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-ink-950 p-1 ring-1 ring-ink-600 overflow-hidden shrink-0">
            <QRCodeViewer
              ref={successQrViewerRef}
              data={createdResult.shortUrl}
              config={createdResult.qrConfig || fallbackQrConfig || DEFAULT_QR_CONFIG}
              size={84}
              showFrame={false}
            />
          </div>
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-paper-300">
                QR Code Asset
              </p>
              <span className="badge-accent text-[10px]">Customized</span>
            </div>
            <p className="text-xs text-paper-500">Ready for print and collateral packaging.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCustomizeQr}
                className="btn-primary btn-sm"
              >
                <Sparkles size={13} />
                <span>Customize QR</span>
              </button>
              <button
                type="button"
                onClick={() => downloadQr('png')}
                className="btn-secondary btn-sm"
              >
                <Download size={13} />
                <span>High-Res PNG</span>
              </button>
            </div>
          </div>
        </div>

        {/* Share Card */}
        <div className="panel p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-paper-300">
            Quick Share
          </p>
          <p className="text-xs text-paper-500">Broadcast your link instantly:</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(createdResult.shortUrl)}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm"
            >
              Twitter / X
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(createdResult.shortUrl)}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm"
            >
              LinkedIn
            </a>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(createdResult.shortUrl)}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </div>

      <div className="flex gap-3 border-t border-ink-700 pt-4">
        <button
          type="button"
          onClick={onCreateAnother}
          className="btn-secondary flex-1"
        >
          Create Another Link
        </button>
        <button type="button" onClick={onDone} className="btn-primary flex-1">
          Done
        </button>
      </div>
    </>
  );
}
