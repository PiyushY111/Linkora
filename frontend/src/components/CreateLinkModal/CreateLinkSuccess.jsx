import { motion } from 'framer-motion';
import { Sparkles, Copy, Check, Download } from 'lucide-react';
import QRCodeViewer from '../qr/QRCodeViewer';
import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';

const shareLinks = (shortUrl) => [
  { label: 'Twitter / X', href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shortUrl)}` },
  { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shortUrl)}` },
  { label: 'WhatsApp', href: `https://api.whatsapp.com/send?text=${encodeURIComponent(shortUrl)}` },
];

export default function CreateLinkSuccess({
  createdResult,
  formQrConfig,
  copied,
  successQrViewerRef,
  onCopy,
  onCustomizeQr,
  onDownloadQr,
  onCreateAnother,
  onDone,
}) {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6 pt-1"
    >
      <div className="rounded-xl border border-accent-400/30 bg-ink-900 p-5 shadow-glow">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-accent-400">Ready to share</span>
          <span className="badge-success text-xs">Active</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-ink-600 bg-ink-950 px-4 py-3">
          <span className="truncate font-mono text-base font-semibold text-accent-400">{createdResult.shortUrl}</span>
          <button type="button" onClick={onCopy} className="btn-primary btn-sm shrink-0">
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
              config={createdResult.qrConfig || formQrConfig || DEFAULT_QR_CONFIG}
              size={84}
              showFrame={false}
            />
          </div>
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-paper-300">QR Code Asset</p>
              <span className="badge-accent text-[10px]">Customized</span>
            </div>
            <p className="text-xs text-paper-500">Ready for print and collateral packaging.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onCustomizeQr} className="btn-primary btn-sm">
                <Sparkles size={13} />
                <span>Customize QR</span>
              </button>
              <button type="button" onClick={() => onDownloadQr('png')} className="btn-secondary btn-sm">
                <Download size={13} />
                <span>High-Res PNG</span>
              </button>
            </div>
          </div>
        </div>

        {/* Share Card */}
        <div className="panel p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-paper-300">Quick Share</p>
          <p className="text-xs text-paper-500">Broadcast your link instantly:</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {shareLinks(createdResult.shortUrl).map(({ label, href }) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 border-t border-ink-700 pt-4">
        <button type="button" onClick={onCreateAnother} className="btn-secondary flex-1">
          Create Another Link
        </button>
        <button type="button" onClick={onDone} className="btn-primary flex-1">
          Done
        </button>
      </div>
    </motion.div>
  );
}
