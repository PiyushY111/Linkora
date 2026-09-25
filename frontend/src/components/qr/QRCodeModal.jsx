import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  Copy,
  Check,
  Save,
  Sun,
  Moon,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import QRCodeViewer from './QRCodeViewer';
import QRCodeCustomizer from './QRCodeCustomizer';
import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';
import { linkService, workspaceService } from '../../services';
import useLinkStore from '../../context/linkStore';
import useAuthStore, { useCan } from '../../context/authStore';
import { workspaceQrDefault } from '../../utils/workspaceDefaults';

export default function QRCodeModal({ open, onClose, link, onSaveSuccess }) {
  // Viewers may preview and download a QR code, but not save it to the link.
  const canWriteLinks = useCan('links:write');
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace);
  const canSetWorkspaceDefault = useCan('settings:manage');
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const qrDefault = useMemo(() => workspaceQrDefault(activeWorkspace), [activeWorkspace]);
  const [config, setConfig] = useState(DEFAULT_QR_CONFIG);
  const [lightBackdrop, setLightBackdrop] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [resolution, setResolution] = useState(1024);

  const [destinationUrl, setDestinationUrl] = useState('');
  const [isUpdatingDest, setIsUpdatingDest] = useState(false);

  const qrViewerRef = useRef(null);
  const { updateLink } = useLinkStore();

  useEffect(() => {
    if (link) {
      setDestinationUrl(link.originalUrl || '');
      if (link.qrConfig && typeof link.qrConfig === 'object') {
        setConfig(link.qrConfig);
      } else {
        setConfig(qrDefault);
      }
    }
  }, [link, open, qrDefault]);

  if (!open || !link) return null;

  // Saves the style being designed as the active workspace's default for
  // new QR codes (admin+; the server re-validates the shape).
  const handleMakeWorkspaceDefault = async () => {
    setIsSavingDefault(true);
    try {
      const data = await workspaceService.updateSettings(activeWorkspace.id, { defaultQrStyle: config });
      setActiveWorkspace({ ...activeWorkspace, settings: data.settings });
      toast.success(`Default QR style saved for ${activeWorkspace.name}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save workspace default');
    } finally {
      setIsSavingDefault(false);
    }
  };

  const handleDownload = async (format = 'png') => {
    if (!qrViewerRef.current) return;
    try {
      const filename = `${link.shortCode || 'linkora'}-custom-qr`;
      await qrViewerRef.current.download(filename, format, resolution);
      toast.success(`Downloaded ${format.toUpperCase()} (${resolution}px)`);
    } catch (err) {
      toast.error('Failed to download QR code');
    }
  };

  const handleCopyImage = async () => {
    if (!qrViewerRef.current) return;
    try {
      const blob = await qrViewerRef.current.getRawBlob('png', 1024);
      if (!blob) throw new Error('No blob generated');
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast.success('QR Code copied to clipboard!');
    } catch (err) {
      toast.error('Unable to copy image to clipboard in this browser');
    }
  };

  const handleSaveToLink = async () => {
    setIsSaving(true);
    try {
      // Generate clean base64 snapshot to store with link (safe fallback)
      let dataUrl = null;
      if (qrViewerRef.current?.getDataUrl) {
        try {
          dataUrl = await qrViewerRef.current.getDataUrl(512);
        } catch (canvasErr) {
          console.warn('Canvas export warning:', canvasErr);
        }
      }

      const payload = { qrConfig: config };
      if (dataUrl) payload.qrCode = dataUrl;

      const res = await linkService.updateLink(link._id, payload);

      if (res?.link) {
        updateLink(res.link);
        if (onSaveSuccess) onSaveSuccess(res.link);
      }
      toast.success('Custom QR code saved to this link!');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save QR configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateDestination = async () => {
    if (!destinationUrl.trim()) {
      toast.error('Destination URL cannot be empty');
      return;
    }
    let normalized = destinationUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    setIsUpdatingDest(true);
    try {
      const res = await linkService.updateLink(link._id, { originalUrl: normalized });
      if (res?.link) {
        updateLink(res.link);
        if (onSaveSuccess) onSaveSuccess(res.link);
      }
      toast.success('Destination updated! All future QR scans will now redirect here.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update destination');
    } finally {
      setIsUpdatingDest(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-ink-950/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-950 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-400/10 text-accent-400 ring-1 ring-accent-400/25">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-paper-100">
                  Custom QR Designer: <span className="font-mono text-accent-400">/{link.shortCode}</span>
                </h3>
                <p className="text-xs text-paper-500">
                  Style patterns, gradients, and brand assets for this shortened link.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-paper-500 transition-colors hover:bg-ink-800 hover:text-paper-100"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body: Split View (Designer on Left, Live Stage on Right) */}
          <div className="grid grid-cols-1 divide-y divide-ink-700 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
            {/* Left Controls Column */}
            <div className="p-6 lg:col-span-7">
              <QRCodeCustomizer
                config={config}
                onChange={setConfig}
                onReset={() => setConfig(qrDefault)}
              />
            </div>

            {/* Right Live Stage & Export Column */}
            <div className="flex flex-col justify-between bg-ink-900/40 p-6 lg:col-span-5">
              <div className="space-y-4">
                {/* Stage Header Controls */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-paper-400">
                    Live Preview
                  </span>
                  <button
                    type="button"
                    onClick={() => setLightBackdrop(!lightBackdrop)}
                    className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1 text-xs text-paper-300 transition-colors hover:border-ink-600 hover:text-paper-100"
                    title="Toggle light/dark canvas backdrop"
                  >
                    {lightBackdrop ? <Moon size={12} /> : <Sun size={12} />}
                    <span>{lightBackdrop ? 'Dark Stage' : 'Paper Stage'}</span>
                  </button>
                </div>

                {/* Canvas Stage */}
                <div
                  className={`flex min-h-[310px] items-center justify-center rounded-2xl border p-6 transition-all ${
                    lightBackdrop
                      ? 'border-zinc-300 bg-white shadow-inner'
                      : 'border-ink-700/80 bg-ink-900/90 shadow-panel'
                  }`}
                >
                  <QRCodeViewer
                    ref={qrViewerRef}
                    data={link.shortUrl}
                    config={config}
                    size={210}
                    showFrame={true}
                    lightBackdrop={lightBackdrop}
                  />
                </div>

                {/* Target Link Info */}
                <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-3">
                  <div className="flex items-center justify-between text-xs text-paper-400">
                    <span>Encoded QR URL:</span>
                    <a
                      href={link.shortUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-mono text-paper-200 hover:text-accent-400"
                    >
                      <span className="truncate max-w-[200px]">{link.shortUrl}</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>

                {/* Dynamic Destination URL Manager */}
                <div className="rounded-xl border border-accent-400/30 bg-accent-400/5 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-accent-400 animate-pulse" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-paper-200">
                        Dynamic Destination
                      </span>
                    </div>
                    <span className="badge-accent text-[10px]">Editable Anytime</span>
                  </div>

                  <p className="text-[11px] text-paper-400">
                    Change destination without changing or reprinting this physical QR code:
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={destinationUrl}
                      onChange={(e) => setDestinationUrl(e.target.value)}
                      className="input text-xs py-1.5 flex-1 font-mono"
                      placeholder="https://new-destination.com"
                      readOnly={!canWriteLinks}
                    />
                    <button
                      type="button"
                      onClick={handleUpdateDestination}
                      disabled={!canWriteLinks || isUpdatingDest || !destinationUrl.trim() || destinationUrl.trim() === link.originalUrl}
                      className="btn-secondary btn-sm whitespace-nowrap text-xs"
                    >
                      {isUpdatingDest ? 'Saving…' : 'Update'}
                    </button>
                  </div>
                </div>

                {/* Resolution selector */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-paper-400">Export Quality:</span>
                  <div className="flex gap-1">
                    {[
                      { label: 'Standard (512)', value: 512 },
                      { label: 'HD (1024)', value: 1024 },
                      { label: 'Print (2048)', value: 2048 },
                    ].map((res) => (
                      <button
                        key={res.value}
                        type="button"
                        onClick={() => setResolution(res.value)}
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-all ${
                          resolution === res.value
                            ? 'bg-ink-700 text-paper-100 ring-1 ring-ink-600'
                            : 'text-paper-500 hover:text-paper-300'
                        }`}
                      >
                        {res.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-2 pt-4 border-t border-ink-700">
                {canWriteLinks && (
                  <button
                    type="button"
                    onClick={handleSaveToLink}
                    disabled={isSaving}
                    className="btn-primary w-full py-2.5"
                  >
                    <Save size={15} />
                    <span>{isSaving ? 'Saving…' : 'Save Custom QR to Link'}</span>
                  </button>
                )}
                {canSetWorkspaceDefault && (
                  <button
                    type="button"
                    onClick={handleMakeWorkspaceDefault}
                    disabled={isSavingDefault}
                    className="btn-secondary w-full py-2 text-xs"
                    title="New links and QR codes in this workspace start with this style"
                  >
                    {isSavingDefault ? 'Saving…' : 'Make workspace default'}
                  </button>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownload('png')}
                    className="btn-secondary btn-sm flex-1"
                  >
                    <Download size={13} />
                    <span>Download PNG</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownload('svg')}
                    className="btn-secondary btn-sm flex-1"
                  >
                    <Download size={13} />
                    <span>Vector SVG</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyImage}
                    className="btn-secondary btn-sm px-3"
                    title="Copy image to clipboard"
                  >
                    {isCopied ? <Check size={14} className="text-accent-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
