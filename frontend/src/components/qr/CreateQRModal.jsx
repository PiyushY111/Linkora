import { useState, useRef, useMemo, useEffect } from 'react';
import {
  Link2,
  Globe,
  Wifi,
  User,
  FileText,
  Copy,
  Check,
  Download,
  Dice5,
  Sun,
  Moon,
  Zap,
  ShieldCheck,
  Palette,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import QRCodeViewer from './QRCodeViewer';
import QRCodeCustomizer from './QRCodeCustomizer';
import { formatQrData, QR_DESIGNER_PRESETS } from '../../utils/qrPresets';
import { linkService } from '../../services';
import useLinkStore from '../../context/linkStore';
import useAuthStore from '../../context/authStore';
import { workspaceQrDefault } from '../../utils/workspaceDefaults';
import { getHostedDomain, getHostedOrigin } from '../../utils/domain';

const CONTENT_TYPES = [
  { id: 'dynamic', label: 'Dynamic Link', icon: Zap, badge: 'Recommended', desc: 'Editable target URL anytime without reprinting' },
  { id: 'url', label: 'Direct URL', icon: Globe, desc: 'Direct destination website link' },
  { id: 'wifi', label: 'WiFi Network', icon: Wifi, desc: 'Instant connect without typing passwords' },
  { id: 'vcard', label: 'vCard Profile', icon: User, desc: 'Full business contact card' },
  { id: 'text', label: 'Plain Text', icon: FileText, desc: 'Notes, serial codes or plain text' },
];

const CATEGORIES = [
  { id: 'marketing', label: 'Marketing' },
  { id: 'sales', label: 'Sales' },
  { id: 'product', label: 'Product' },
  { id: 'social', label: 'Social' },
  { id: 'personal', label: 'Personal' },
  { id: 'other', label: 'Other' },
];

export default function CreateQRModal({ open, onClose, onCreated }) {
  const { addLink } = useLinkStore();

  // Step / Tab: 'content' | 'styling'
  const [modalTab, setModalTab] = useState('content');
  const [contentType, setContentType] = useState('dynamic');

  // Form Fields
  const [destinationUrl, setDestinationUrl] = useState('');
  const [title, setTitle] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [category, setCategory] = useState('marketing');
  const customAliasInputRef = useRef(null);
  const hostedDomain = useMemo(() => getHostedDomain(), []);

  // Alternate payload types
  const [wifiData, setWifiData] = useState({ ssid: '', password: '', encryption: 'WPA', hidden: false });
  const [vcardData, setVcardData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    company: '',
    jobTitle: '',
    url: '',
    address: '',
  });
  const [textInput, setTextInput] = useState('');

  // QR Styling Config, starting from the workspace's default style
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const qrDefault = useMemo(() => workspaceQrDefault(activeWorkspace), [activeWorkspace]);
  const [config, setConfig] = useState(qrDefault);
  const [lightBackdrop, setLightBackdrop] = useState(false);
  const [resolution] = useState(1024);

  // Status & Success state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdAsset, setCreatedAsset] = useState(null);
  const [isCopied, setIsCopied] = useState(false);

  const qrViewerRef = useRef(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setModalTab('content');
      setContentType('dynamic');
      setDestinationUrl('');
      setTitle('');
      setCustomAlias('');
      setCategory('marketing');
      setWifiData({ ssid: '', password: '', encryption: 'WPA', hidden: false });
      setVcardData({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        company: '',
        jobTitle: '',
        url: '',
        address: '',
      });
      setTextInput('');
      setConfig(qrDefault);
      setCreatedAsset(null);
      setIsCopied(false);
    }
  }, [open, qrDefault]);

  // Compute raw payload data for live preview
  const previewPayload = useMemo(() => {
    switch (contentType) {
      case 'dynamic':
        if (!destinationUrl.trim()) return `${getHostedOrigin()}/${customAlias.trim() || 'qr-preview'}`;
        return formatQrData.url(destinationUrl);
      case 'url':
        return formatQrData.url(destinationUrl) || getHostedOrigin();
      case 'wifi':
        return formatQrData.wifi(wifiData);
      case 'vcard':
        return formatQrData.vcard(vcardData);
      case 'text':
        return formatQrData.text(textInput) || 'Linkora QR Engine';
      default:
        return getHostedOrigin();
    }
  }, [contentType, destinationUrl, customAlias, wifiData, vcardData, textInput]);

  const generateRandomSlug = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCustomAlias(code);
  };

  const handleDownload = async (format = 'png') => {
    if (!qrViewerRef.current) return;
    try {
      const filename = `${createdAsset?.shortCode || customAlias || 'linkora'}-qr`;
      await qrViewerRef.current.download(filename, format, resolution);
      toast.success(`Downloaded ${format.toUpperCase()}`);
    } catch {
      toast.error('Failed to download QR code');
    }
  };

  const handleCopyLink = () => {
    if (!createdAsset?.shortUrl) return;
    navigator.clipboard.writeText(createdAsset.shortUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast.success('Short link copied to clipboard!');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();

    if (contentType === 'dynamic' || contentType === 'url') {
      if (!destinationUrl.trim()) {
        toast.error('Please enter a destination URL');
        return;
      }
    } else if (contentType === 'wifi' && !wifiData.ssid.trim()) {
      toast.error('Please enter WiFi network name (SSID)');
      return;
    } else if (contentType === 'vcard' && !vcardData.firstName.trim() && !vcardData.lastName.trim()) {
      toast.error('Please enter at least a first or last name');
      return;
    } else if (contentType === 'text' && !textInput.trim()) {
      toast.error('Please enter text content');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Generate PNG dataUrl from QR viewer canvas
      let qrDataUrl = '';
      if (qrViewerRef.current?.getDataUrl) {
        qrDataUrl = await qrViewerRef.current.getDataUrl(512);
      }

      // 2. Prepare target originalUrl
      let targetOriginalUrl = '';
      if (contentType === 'dynamic' || contentType === 'url') {
        targetOriginalUrl = formatQrData.url(destinationUrl);
      } else {
        // Direct non-web protocols like wifi, vcard, or mailto
        targetOriginalUrl = previewPayload;
      }

      // 3. Create short link in backend with qrConfig
      const payload = {
        originalUrl: targetOriginalUrl,
        title: title.trim() || `${contentType.toUpperCase()} QR Asset`,
        customAlias: customAlias.trim() || undefined,
        category,
        qrConfig: config,
        qrCode: qrDataUrl,
      };

      const res = await linkService.createLink(payload);
      if (res?.link) {
        addLink(res.link);
        setCreatedAsset(res.link);
        if (onCreated) onCreated(res.link);
        toast.success('Dynamic QR code generated successfully!');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create QR code asset');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title=""
      maxWidth="max-w-5xl"
    >
      <div className="-mt-4">
        {/* Header Bar */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-ink-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400 border border-accent-400/20">
                <Zap size={18} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-paper-100">
                {createdAsset ? 'QR Asset Created' : 'Create Dynamic QR Code'}
              </h2>
              <span className="badge-accent text-[11px]">Real-Time Sync</span>
            </div>
            <p className="mt-1 text-xs text-paper-500">
              Generate customizable, trackable QR assets. Destination links can be modified anytime after deployment.
            </p>
          </div>

          {!createdAsset && (
            <div className="flex items-center gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
              <button
                type="button"
                onClick={() => setModalTab('content')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  modalTab === 'content'
                    ? 'bg-ink-750 text-paper-100 shadow-sm border border-ink-600'
                    : 'text-paper-500 hover:text-paper-300'
                }`}
              >
                <Link2 size={13} />
                <span>1. Payload</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('styling')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  modalTab === 'styling'
                    ? 'bg-ink-750 text-paper-100 shadow-sm border border-ink-600'
                    : 'text-paper-500 hover:text-paper-300'
                }`}
              >
                <Palette size={13} />
                <span>2. Custom Design</span>
              </button>
            </div>
          )}
        </div>

        {/* Success Screen */}
        {createdAsset ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-6 text-center"
          >
            <div className="relative mb-5 flex flex-col items-center">
              <div className="rounded-3xl border border-ink-700 bg-ink-950 p-6 shadow-2xl">
                <QRCodeViewer
                  ref={qrViewerRef}
                  data={createdAsset.shortUrl}
                  config={createdAsset.qrConfig || config}
                  size={260}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
                <ShieldCheck size={14} />
                <span>Dynamic Redirect Active</span>
              </div>
            </div>

            <h3 className="text-xl font-bold text-paper-100">{createdAsset.title || 'Dynamic QR Asset'}</h3>
            <p className="mt-1 max-w-md text-xs text-paper-400">
              Scan this code to test instant redirection. You can modify its target destination at any time without changing this printed graphic.
            </p>

            {/* Short Link Display */}
            <div className="mt-5 flex w-full max-w-md items-center justify-between rounded-xl border border-ink-700 bg-ink-900 p-2 pl-3">
              <span className="font-mono text-xs text-accent-400 truncate">{createdAsset.shortUrl}</span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="btn-secondary btn-sm ml-2"
              >
                {isCopied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Export & Finish Buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleDownload('png')}
                className="btn-secondary"
              >
                <Download size={15} />
                <span>Download PNG (1024px)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownload('svg')}
                className="btn-secondary"
              >
                <Download size={15} />
                <span>Download Vector SVG</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary"
              >
                <span>Done & View in Studio</span>
              </button>
            </div>
          </motion.div>
        ) : (
          /* Main Creation Flow (2 Columns) */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Form & Settings (7 cols) */}
            <div className="lg:col-span-7">
              {modalTab === 'content' ? (
                <div className="space-y-4">
                  {/* Content Type Selector */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-paper-500">
                      Select QR Content Type
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {CONTENT_TYPES.map((t) => {
                        const Icon = t.icon;
                        const isSelected = contentType === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setContentType(t.id)}
                            className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                              isSelected
                                ? 'border-accent-400 bg-accent-400/10 text-paper-100 shadow-sm'
                                : 'border-ink-700 bg-ink-900/60 text-paper-400 hover:border-ink-600 hover:text-paper-200'
                            }`}
                          >
                            <div className="flex w-full items-center justify-between">
                              <Icon size={16} className={isSelected ? 'text-accent-400' : 'text-paper-500'} />
                              {t.badge && (
                                <span className="rounded bg-accent-400/20 px-1 py-0.5 text-[9px] font-bold text-accent-400">
                                  {t.badge}
                                </span>
                              )}
                            </div>
                            <span className="mt-1 text-xs font-bold">{t.label}</span>
                            <span className="mt-0.5 text-[10px] text-paper-500 line-clamp-1">{t.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dynamic Alert Banner */}
                  {contentType === 'dynamic' && (
                    <div className="rounded-xl border border-accent-400/25 bg-accent-400/5 p-3">
                      <div className="flex items-start gap-2.5">
                        <Zap size={15} className="mt-0.5 text-accent-400 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-paper-100">Dynamic Short URL Redirection</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-paper-400">
                            We route scans through a high-speed Linkora short URL. You can change where this QR points in the future with zero downtime and no re-printing.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Form Inputs based on Content Type */}
                  {(contentType === 'dynamic' || contentType === 'url') && (
                    <div className="space-y-3.5">
                      <div>
                        <label className="text-xs font-semibold text-paper-300">
                          Destination URL <span className="text-accent-400">*</span>
                        </label>
                        <input
                          type="url"
                          required
                          value={destinationUrl}
                          onChange={(e) => setDestinationUrl(e.target.value)}
                          placeholder="https://example.com/your-destination"
                          className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-2.5 text-xs text-paper-100 placeholder:text-paper-600 focus:border-accent-400/80 focus:ring-1 focus:ring-accent-400/30 font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-semibold text-paper-300">
                            Asset Title <span className="text-paper-600">(Optional)</span>
                          </label>
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Product Launch Poster"
                            className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-2 text-xs text-paper-100 placeholder:text-paper-600 focus:border-accent-400/80 focus:ring-1 focus:ring-accent-400/30"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-paper-300">Category</label>
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs font-medium text-paper-300 outline-none focus:border-ink-500"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {contentType === 'dynamic' && (
                        <div>
                          <div className="flex items-center justify-between">
                            <label htmlFor="qr-custom-alias" className="text-xs font-semibold text-paper-300">
                              Custom Alias / Short Code <span className="text-paper-600">(Optional)</span>
                            </label>
                            <button
                              type="button"
                              onClick={generateRandomSlug}
                              className="flex items-center gap-1 text-[11px] font-medium text-accent-400 hover:underline"
                            >
                              <Dice5 size={12} />
                              <span>Random</span>
                            </button>
                          </div>
                          <div
                            onClick={() => customAliasInputRef.current?.focus()}
                            className="mt-1.5 flex items-stretch rounded-xl border border-ink-700 bg-ink-900 focus-within:border-accent-400/80 focus-within:ring-1 focus-within:ring-accent-400/30 overflow-hidden cursor-text transition-all"
                          >
                            <span className="inline-flex items-center border-r border-ink-800 bg-ink-950/70 px-3 text-xs font-mono text-paper-400 select-none whitespace-nowrap cursor-default">
                              {hostedDomain}/
                            </span>
                            <input
                              ref={customAliasInputRef}
                              id="qr-custom-alias"
                              type="text"
                              value={customAlias}
                              onChange={(e) => setCustomAlias(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                              placeholder="custom-slug"
                              className="w-full min-w-0 bg-transparent py-2 px-3 font-mono text-xs text-paper-100 placeholder:text-paper-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* WiFi Content Form */}
                  {contentType === 'wifi' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-paper-300">
                          Network Name (SSID) <span className="text-accent-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={wifiData.ssid}
                          onChange={(e) => setWifiData((prev) => ({ ...prev, ssid: e.target.value }))}
                          placeholder="Office_Guest_WiFi"
                          className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-2 text-xs text-paper-100 placeholder:text-paper-600 focus:border-accent-400/80 focus:ring-1 focus:ring-accent-400/30 font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-paper-300">Password</label>
                          <input
                            type="password"
                            value={wifiData.password}
                            onChange={(e) => setWifiData((prev) => ({ ...prev, password: e.target.value }))}
                            placeholder="WPA2 Password"
                            className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-2 text-xs text-paper-100 placeholder:text-paper-600 focus:border-accent-400/80 focus:ring-1 focus:ring-accent-400/30"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-paper-300">Encryption</label>
                          <select
                            value={wifiData.encryption}
                            onChange={(e) => setWifiData((prev) => ({ ...prev, encryption: e.target.value }))}
                            className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-paper-300 outline-none"
                          >
                            <option value="WPA">WPA / WPA2 / WPA3</option>
                            <option value="WEP">WEP</option>
                            <option value="none">No Password (Open)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* vCard Content Form */}
                  {contentType === 'vcard' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-paper-300">First Name</label>
                          <input
                            type="text"
                            value={vcardData.firstName}
                            onChange={(e) => setVcardData((prev) => ({ ...prev, firstName: e.target.value }))}
                            placeholder="Alex"
                            className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-paper-100 placeholder:text-paper-600 focus:border-accent-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-paper-300">Last Name</label>
                          <input
                            type="text"
                            value={vcardData.lastName}
                            onChange={(e) => setVcardData((prev) => ({ ...prev, lastName: e.target.value }))}
                            placeholder="Rivera"
                            className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-paper-100 placeholder:text-paper-600 focus:border-accent-400"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-paper-300">Phone</label>
                          <input
                            type="tel"
                            value={vcardData.phone}
                            onChange={(e) => setVcardData((prev) => ({ ...prev, phone: e.target.value }))}
                            placeholder="+1 (555) 019-2834"
                            className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-paper-100 placeholder:text-paper-600 focus:border-accent-400 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-paper-300">Email</label>
                          <input
                            type="email"
                            value={vcardData.email}
                            onChange={(e) => setVcardData((prev) => ({ ...prev, email: e.target.value }))}
                            placeholder="alex@company.com"
                            className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-paper-100 placeholder:text-paper-600 focus:border-accent-400"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Plain Text Content Form */}
                  {contentType === 'text' && (
                    <div>
                      <label className="text-xs font-semibold text-paper-300">Plain Text Payload</label>
                      <textarea
                        rows={4}
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Enter text or raw data to encode into QR code..."
                        className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-900 p-3 text-xs text-paper-100 placeholder:text-paper-600 focus:border-accent-400 font-mono"
                      />
                    </div>
                  )}

                  {/* Quick Shortcut to Design Step */}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setModalTab('styling')}
                      className="btn-secondary btn-sm flex items-center gap-1.5"
                    >
                      <span>Customize Styling</span>
                      <Palette size={13} className="text-accent-400" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Tab 2: Custom Styling */
                <div className="max-h-[460px] overflow-y-auto pr-1">
                  <QRCodeCustomizer
                    config={config}
                    onChange={setConfig}
                  />
                </div>
              )}
            </div>

            {/* Right Column: Live Interactive QR Preview (5 cols) */}
            <div className="flex flex-col items-center justify-between rounded-2xl border border-ink-700 bg-ink-950/80 p-5 lg:col-span-5">
              <div className="w-full flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-paper-500">
                  Live Preview
                </span>
                <button
                  type="button"
                  onClick={() => setLightBackdrop(!lightBackdrop)}
                  className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1 text-[11px] font-medium text-paper-400 hover:text-paper-200"
                  title="Toggle Light / Dark contrast background"
                >
                  {lightBackdrop ? <Moon size={12} /> : <Sun size={12} />}
                  <span>{lightBackdrop ? 'Dark' : 'Light'} Test</span>
                </button>
              </div>

              {/* QR Canvas Box */}
              <div
                className={`relative flex min-h-[260px] w-full items-center justify-center rounded-2xl border transition-colors p-4 ${
                  lightBackdrop
                    ? 'border-ink-300 bg-paper-100 shadow-inner'
                    : 'border-ink-800 bg-ink-950 shadow-2xl'
                }`}
              >
                <QRCodeViewer
                  ref={qrViewerRef}
                  data={previewPayload}
                  config={config}
                  size={220}
                />
              </div>

              {/* Quick Preset Selector */}
              <div className="mt-4 w-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-paper-400">Quick Designer Styles</span>
                  <span className="text-[10px] text-paper-500">{config.dotsType} • {config.frame?.type}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {QR_DESIGNER_PRESETS.slice(0, 4).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, ...preset.config }))}
                      className="rounded-lg border border-ink-700 bg-ink-900 p-1.5 text-center text-[10px] font-medium text-paper-300 hover:border-accent-400/50 hover:text-accent-400 transition-colors"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex w-full items-center gap-2 pt-4 border-t border-ink-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-ghost flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  className="btn-primary flex-2 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-950 border-t-transparent" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={15} />
                      <span>Create Dynamic QR</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
