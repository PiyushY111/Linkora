import { useState } from 'react';
import { Sparkles, ArrowRight, SlidersHorizontal, Copy, Check, ExternalLink, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { linkService } from '../../services';
import useLinkStore from '../../context/linkStore';
import QRCodeModal from '../qr/QRCodeModal';

export default function QuickShortenBar({ onOpenAdvanced }) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastCreated, setLastCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const { addLink } = useLinkStore();

  const handleQuickShorten = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    setIsLoading(true);
    try {
      const result = await linkService.createLink({ originalUrl: normalizedUrl });
      addLink(result.link);
      setLastCreated(result.link);
      setUrl('');
      
      // Auto-copy to clipboard for frictionless enterprise flow
      try {
        await navigator.clipboard.writeText(result.link.shortUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        toast.success('Link created & copied to clipboard!');
      } catch {
        toast.success('Link created successfully!');
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to shorten URL'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyUrl = (shortUrl) => {
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="mb-6 space-y-3">
      <form
        onSubmit={handleQuickShorten}
        className="relative flex flex-col items-stretch gap-2 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-paper-500">
            <Sparkles size={16} className="text-accent-400" />
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a long URL to shorten instantly..."
            className="w-full rounded-xl border border-ink-600 bg-ink-900/90 py-3.5 pl-10 pr-24 text-sm text-paper-100 placeholder:text-paper-500 shadow-panel backdrop-blur transition-all duration-150 focus:border-accent-400/80 focus:ring-2 focus:ring-accent-400/20"
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenAdvanced}
              title="Open full enterprise options (⌘K)"
              className="hidden items-center gap-1 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 text-xs font-medium text-paper-300 transition-colors hover:border-ink-500 hover:text-paper-100 sm:flex"
            >
              <SlidersHorizontal size={12} />
              <span>Advanced</span>
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="btn-primary flex-1 whitespace-nowrap py-3.5 sm:flex-initial"
          >
            {isLoading ? (
              <span>Shortening…</span>
            ) : (
              <>
                <span>Shorten</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenAdvanced}
            className="btn-secondary py-3.5 sm:hidden"
            title="Advanced options"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </form>

      {/* Quick Success Banner for the most recently created link */}
      <AnimatePresence>
        {lastCreated && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className="flex flex-col items-start justify-between gap-3 rounded-xl border border-accent-400/30 bg-accent-400/5 p-3.5 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400 ring-1 ring-accent-400/25">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent-400">Ready to share</span>
                  <span className="text-xs text-paper-500">•</span>
                  <a
                    href={lastCreated.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs text-paper-500 hover:text-paper-300"
                  >
                    {lastCreated.originalUrl}
                  </a>
                </div>
                <p className="truncate font-mono text-sm font-semibold text-paper-100">
                  {lastCreated.shortUrl}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => copyUrl(lastCreated.shortUrl)}
                className="btn-primary btn-sm flex-1 sm:flex-initial"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="btn-secondary btn-sm"
                title="Customize QR code"
              >
                <QrCode size={14} />
                <span className="hidden sm:inline">Custom QR</span>
              </button>
              <a
                href={lastCreated.shortUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary btn-sm"
                title="Test destination"
              >
                <ExternalLink size={14} />
              </a>
              <button
                type="button"
                onClick={() => setLastCreated(null)}
                className="btn-ghost btn-sm text-paper-500 hover:text-paper-300"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <QRCodeModal
        open={showQrModal}
        onClose={() => setShowQrModal(false)}
        link={lastCreated}
      />
    </div>
  );
}
