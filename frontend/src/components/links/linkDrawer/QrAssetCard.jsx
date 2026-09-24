import { Sparkles, Download } from 'lucide-react';
import QRCodeViewer from '../../qr/QRCodeViewer';

/** The link's QR code with customize and download actions. */
export default function QrAssetCard({ link, onCustomize }) {
  const downloadQr = () => {
    if (!link.qrCode) return;
    const a = document.createElement('a');
    a.href = link.qrCode;
    a.download = `${link.shortCode}-qr.png`;
    a.click();
  };

  return (
    <div className="panel p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div
          onClick={onCustomize}
          className="relative group cursor-pointer shrink-0"
          title="Click to customize QR code"
        >
          {link.qrConfig ? (
            <div className="h-20 w-20 rounded-xl bg-ink-950 p-1 ring-1 ring-ink-600 transition-transform group-hover:scale-105 flex items-center justify-center overflow-hidden">
              <QRCodeViewer
                data={link.shortUrl}
                config={link.qrConfig}
                size={72}
                showFrame={false}
              />
            </div>
          ) : (
            <img
              src={link.qrCode || `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(link.shortUrl)}`}
              alt="QR Code"
              className="h-20 w-20 rounded-xl bg-ink-950 p-1.5 ring-1 ring-ink-600 transition-transform group-hover:scale-105"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-ink-950/70 opacity-0 group-hover:opacity-100 transition-opacity">
            <Sparkles size={18} className="text-accent-400" />
          </div>
        </div>
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-paper-300">
              Dynamic QR Asset
            </h4>
            <span className="badge-accent text-[10px]">Editable Target</span>
            {link.qrConfig && (
              <span className="badge-neutral text-[10px]">Customized</span>
            )}
          </div>
          <p className="text-xs text-paper-400 truncate">
            Redirects to: <span className="font-mono text-paper-200">{link.originalUrl}</span>. Change target anytime without reprinting.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onCustomize}
              className="btn-primary btn-sm"
            >
              <Sparkles size={12} />
              <span>Customize QR</span>
            </button>
            <button
              type="button"
              onClick={downloadQr}
              className="btn-secondary btn-sm"
            >
              <Download size={12} />
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
