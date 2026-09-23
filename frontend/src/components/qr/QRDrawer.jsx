import { useState, useRef, useEffect } from 'react';
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
  BarChart3,
  Power,
  Trash2,
  Printer,
  ShieldCheck,
  Edit3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link as RouterLink } from 'react-router-dom';
import QRCodeViewer from './QRCodeViewer';
import QRCodeCustomizer from './QRCodeCustomizer';
import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';
import { linkService } from '../../services';
import useLinkStore from '../../context/linkStore';
import { useConfirm } from '../../context/ConfirmContext';

export default function QRDrawer({ link, open, onClose, onUpdate }) {
  const confirm = useConfirm();
  const { updateLink, removeLink } = useLinkStore();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'designer'
  const [config, setConfig] = useState(DEFAULT_QR_CONFIG);
  const [lightBackdrop, setLightBackdrop] = useState(false);
  const [destinationUrl, setDestinationUrl] = useState('');
  const [isUpdatingDest, setIsUpdatingDest] = useState(false);
  const [isSavingStyle, setIsSavingStyle] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [resolution, setResolution] = useState(1024);

  const qrViewerRef = useRef(null);

  useEffect(() => {
    if (link) {
      setDestinationUrl(link.originalUrl || '');
      if (link.qrConfig && typeof link.qrConfig === 'object') {
        setConfig(link.qrConfig);
      } else {
        setConfig(DEFAULT_QR_CONFIG);
      }
    }
  }, [link, open]);

  if (!open || !link) return null;

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
        if (onUpdate) onUpdate(res.link);
      }
      toast.success('Destination updated! All future scans will redirect to this link.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update destination');
    } finally {
      setIsUpdatingDest(false);
    }
  };

  const handleSaveStyle = async () => {
    setIsSavingStyle(true);
    try {
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
        if (onUpdate) onUpdate(res.link);
      }
      toast.success('QR Code styling saved!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save styling');
    } finally {
      setIsSavingStyle(false);
    }
  };

  const handleDownload = async (format = 'png') => {
    if (!qrViewerRef.current) return;
    try {
      const filename = `${link.shortCode || 'qr'}-asset`;
      await qrViewerRef.current.download(filename, format, resolution);
      toast.success(`Downloaded ${format.toUpperCase()} (${resolution}px)`);
    } catch {
      toast.error('Download failed');
    }
  };

  const handleCopyImage = async () => {
    if (!qrViewerRef.current) return;
    try {
      const blob = await qrViewerRef.current.getRawBlob('png', 1024);
      if (!blob) throw new Error('No blob');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast.success('QR Code copied to clipboard!');
    } catch {
      toast.error('Unable to copy image to clipboard in this browser');
    }
  };

  const handleToggleStatus = async () => {
    try {
      const data = await linkService.toggleLinkStatus(link._id);
      updateLink(data.link);
      toast.success(data.link.isActive ? 'QR activated' : 'QR paused');
    } catch {
      toast.error('Failed to toggle status');
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete QR Code',
      message: 'Are you sure you want to delete this QR code? Redirects will permanently stop functioning.',
      confirmText: 'Delete QR',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await linkService.deleteLink(link._id);
      removeLink(link._id);
      toast.success('QR code deleted');
      onClose();
    } catch {
      toast.error('Failed to delete QR');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm"
        />

        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="w-screen max-w-xl border-l border-ink-700 bg-ink-950 shadow-2xl flex flex-col"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4 bg-ink-900/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-400/10 text-accent-400 ring-1 ring-accent-400/25">
                  <Sparkles size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-paper-100">
                    {link.title || `/${link.shortCode}`}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs text-accent-400">{link.shortUrl}</span>
                    <span className="badge-accent text-[9px]">Dynamic</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleStatus}
                  className={`rounded-lg p-1.5 transition-colors ${
                    link.isActive ? 'text-accent-400 hover:bg-ink-800' : 'text-paper-500 hover:bg-ink-800'
                  }`}
                  title={link.isActive ? 'Pause QR' : 'Activate QR'}
                >
                  <Power size={16} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-paper-500 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Tab Switcher: Overview vs Style Designer */}
            <div className="flex border-b border-ink-700 px-6 bg-ink-900/30">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-400 hover:text-paper-200'
                }`}
              >
                Overview & Destination
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('designer')}
                className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'designer'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-400 hover:text-paper-200'
                }`}
              >
                <Sparkles size={13} />
                <span>Style Designer</span>
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <>
                  {/* Interactive QR Preview Stage */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-paper-400">
                        Live Scannable Asset
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLightBackdrop(!lightBackdrop)}
                          className="flex items-center gap-1 text-[11px] text-paper-400 hover:text-paper-200 bg-ink-800 px-2 py-1 rounded-md border border-ink-700"
                        >
                          {lightBackdrop ? <Moon size={11} /> : <Sun size={11} />}
                          <span>{lightBackdrop ? 'Dark' : 'Paper'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyImage}
                          className="flex items-center gap-1 text-[11px] text-paper-400 hover:text-paper-200 bg-ink-800 px-2 py-1 rounded-md border border-ink-700"
                          title="Copy image to clipboard"
                        >
                          {isCopied ? <Check size={11} className="text-accent-400" /> : <Copy size={11} />}
                          <span>{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    <div
                      className={`flex min-h-[260px] items-center justify-center rounded-2xl border p-6 transition-all ${
                        lightBackdrop
                          ? 'border-zinc-300 bg-white shadow-inner'
                          : 'border-ink-700 bg-ink-900/90 shadow-2xl'
                      }`}
                    >
                      <QRCodeViewer
                        ref={qrViewerRef}
                        data={link.shortUrl}
                        config={config}
                        size={190}
                        showFrame={true}
                        lightBackdrop={lightBackdrop}
                      />
                    </div>
                  </div>

                  {/* DYNAMIC DESTINATION LINK MANAGER */}
                  <div className="rounded-2xl border border-accent-400/30 bg-accent-400/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={16} className="text-accent-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-paper-100">
                          Dynamic Destination URL
                        </h4>
                      </div>
                      <span className="badge-accent text-[10px]">Editable Anytime</span>
                    </div>

                    <p className="text-xs text-paper-400">
                      Change where this QR code redirects scanners without reprinting the physical code:
                    </p>

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={destinationUrl}
                        onChange={(e) => setDestinationUrl(e.target.value)}
                        placeholder="https://new-target-link.com"
                        className="input font-mono text-xs py-2 flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleUpdateDestination}
                        disabled={
                          isUpdatingDest ||
                          !destinationUrl.trim() ||
                          destinationUrl.trim() === link.originalUrl
                        }
                        className="btn-primary btn-sm whitespace-nowrap"
                      >
                        {isUpdatingDest ? 'Saving…' : 'Update Target'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-accent-400/20 text-paper-500">
                      <span>Live redirect: all new scans open this destination.</span>
                      <a
                        href={link.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-mono text-accent-400 hover:underline"
                      >
                        <span>Test Scan</span>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>

                  {/* Export Options */}
                  <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-paper-300">
                        Export & Print Assets
                      </span>
                      <div className="flex gap-1 text-[11px]">
                        {[512, 1024, 2048].map((res) => (
                          <button
                            key={res}
                            type="button"
                            onClick={() => setResolution(res)}
                            className={`rounded px-2 py-0.5 font-medium transition-colors ${
                              resolution === res ? 'bg-ink-700 text-paper-100' : 'text-paper-500'
                            }`}
                          >
                            {res}px
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownload('png')}
                        className="btn-primary btn-sm"
                      >
                        <Download size={13} />
                        <span>Download PNG</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload('svg')}
                        className="btn-secondary btn-sm"
                      >
                        <Download size={13} />
                        <span>Vector SVG</span>
                      </button>
                    </div>
                  </div>

                  {/* Telemetry Quick Card */}
                  <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-paper-400">
                        Total Scans
                      </p>
                      <p className="font-mono text-2xl font-bold text-paper-100 mt-1">
                        {link.clicks ?? 0}
                      </p>
                    </div>

                    <RouterLink
                      to={`/analytics/${link._id}`}
                      className="btn-secondary btn-sm flex items-center gap-1.5"
                    >
                      <BarChart3 size={13} />
                      <span>Full Analytics</span>
                    </RouterLink>
                  </div>
                </>
              )}

              {/* TAB 2: STYLE DESIGNER */}
              {activeTab === 'designer' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-900 p-3">
                    <div>
                      <h4 className="text-xs font-bold text-paper-100">Visual QR Styling</h4>
                      <p className="text-[11px] text-paper-500">
                        Changes apply directly to this link's QR code.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveStyle}
                      disabled={isSavingStyle}
                      className="btn-primary btn-sm"
                    >
                      <Save size={13} />
                      <span>{isSavingStyle ? 'Saving…' : 'Save Style'}</span>
                    </button>
                  </div>

                  {/* Small Live Preview during styling */}
                  <div
                    className={`flex items-center justify-center rounded-xl border p-4 transition-all ${
                      lightBackdrop ? 'bg-white border-zinc-300' : 'bg-ink-900 border-ink-700'
                    }`}
                  >
                    <QRCodeViewer
                      ref={qrViewerRef}
                      data={link.shortUrl}
                      config={config}
                      size={160}
                      showFrame={true}
                      lightBackdrop={lightBackdrop}
                    />
                  </div>

                  <QRCodeCustomizer
                    config={config}
                    onChange={setConfig}
                    onReset={() => setConfig(DEFAULT_QR_CONFIG)}
                  />
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-ink-700 p-4 bg-ink-950 flex items-center justify-between">
              <button
                type="button"
                onClick={handleDelete}
                className="btn-danger btn-sm"
              >
                <Trash2 size={13} />
                <span>Delete QR</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="btn-secondary btn-sm"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
