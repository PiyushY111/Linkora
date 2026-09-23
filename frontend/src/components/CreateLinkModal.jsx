import { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Sparkles,
  Dice5,
  Lock,
  Calendar,
  Tag,
  Sliders,
  Copy,
  Check,
  Download,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Users,
  Smartphone,
  Globe,
  QrCode,
  Split,
  Share2,
  Trash2,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from './ui/Modal';
import QRCodeModal from './qr/QRCodeModal';
import QRCodeCustomizer from './qr/QRCodeCustomizer';
import { DEFAULT_QR_CONFIG } from '../utils/qrPresets';
import { linkService } from '../services';
import useLinkStore from '../context/linkStore';
import useAuthStore from '../context/authStore';

const CATEGORIES = [
  { id: 'marketing', label: 'Marketing' },
  { id: 'sales', label: 'Sales' },
  { id: 'product', label: 'Product' },
  { id: 'social', label: 'Social' },
  { id: 'personal', label: 'Personal' },
  { id: 'other', label: 'Other' },
];

const UTM_PRESETS = [
  { name: 'Google Ads', source: 'google', medium: 'cpc' },
  { name: 'Twitter / X', source: 'twitter', medium: 'social' },
  { name: 'LinkedIn', source: 'linkedin', medium: 'social' },
  { name: 'Email Newsletter', source: 'newsletter', medium: 'email' },
  { name: 'Facebook Ad', source: 'facebook', medium: 'paid-social' },
];

const EXPIRY_PRESETS = [
  { label: '24h', hours: 24 },
  { label: '7 Days', hours: 24 * 7 },
  { label: '30 Days', hours: 24 * 30 },
  { label: 'Never', hours: 0 },
];

const EMPTY_FORM = {
  originalUrl: '',
  customAlias: '',
  title: '',
  description: '',
  category: 'marketing',
  password: '',
  enablePassword: false,
  enableMaxClicks: false,
  maxClicks: '',
  expiryOption: 'Never',
  customExpiryDate: '',
  expiredRedirectUrl: '',
  iosRedirect: '',
  androidRedirect: '',
  qrConfig: DEFAULT_QR_CONFIG,
  tags: [],
  tagInput: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  utmTerm: '',
  utmContent: '',
  routingType: 'direct', // 'direct' | 'ab_test'
  variants: [
    { id: 'var_a', name: 'Variant A (Control)', url: '', weight: 50 },
    { id: 'var_b', name: 'Variant B (Challenger)', url: '', weight: 50 },
  ],
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
};

export default function CreateLinkModal({ open, onClose }) {
  const { addLink } = useLinkStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'utm' | 'enterprise'
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [createdResult, setCreatedResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Pre-fill user's default category and UTM parameters when opening modal
  useEffect(() => {
    if (open) {
      setFormData({
        ...EMPTY_FORM,
        category: user?.defaultLinkCategory || 'marketing',
        utmSource: user?.defaultUtm?.source || '',
        utmMedium: user?.defaultUtm?.medium || '',
        utmCampaign: user?.defaultUtm?.campaign || '',
      });
      setCreatedResult(null);
      setActiveTab('general');
    }
  }, [open, user]);

  // Auto-generate random alias
  const generateRandomAlias = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, customAlias: code }));
  };

  // Derive domain from originalUrl for favicon preview
  const domain = useMemo(() => {
    try {
      if (!formData.originalUrl) return null;
      let u = formData.originalUrl.trim();
      if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
      const parsed = new URL(u);
      return parsed.hostname;
    } catch {
      return null;
    }
  }, [formData.originalUrl]);

  // Compute final URL with UTM parameters
  const computedDestinationUrl = useMemo(() => {
    if (!formData.originalUrl.trim()) return '';
    try {
      let base = formData.originalUrl.trim();
      if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
      const url = new URL(base);

      if (formData.utmSource.trim()) url.searchParams.set('utm_source', formData.utmSource.trim());
      if (formData.utmMedium.trim()) url.searchParams.set('utm_medium', formData.utmMedium.trim());
      if (formData.utmCampaign.trim()) url.searchParams.set('utm_campaign', formData.utmCampaign.trim());
      if (formData.utmTerm.trim()) url.searchParams.set('utm_term', formData.utmTerm.trim());
      if (formData.utmContent.trim()) url.searchParams.set('utm_content', formData.utmContent.trim());

      return url.toString();
    } catch {
      return formData.originalUrl;
    }
  }, [
    formData.originalUrl,
    formData.utmSource,
    formData.utmMedium,
    formData.utmCampaign,
    formData.utmTerm,
    formData.utmContent,
  ]);

  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = formData.tagInput.trim().replace(/^,+|,+$/g, '');
      if (val && !formData.tags.includes(val)) {
        setFormData((prev) => ({
          ...prev,
          tags: [...prev.tags, val],
          tagInput: '',
        }));
      }
    }
  };

  const removeTag = (tagToRemove) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToRemove),
    }));
  };

  const applyUtmPreset = (preset) => {
    setFormData((prev) => ({
      ...prev,
      utmSource: preset.source,
      utmMedium: preset.medium,
    }));
  };

  const handleClose = () => {
    setFormData(EMPTY_FORM);
    setCreatedResult(null);
    setActiveTab('general');
    setShowPassword(false);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.originalUrl.trim()) {
      toast.error('Destination URL is required');
      return;
    }

    if (formData.enablePassword && !formData.password.trim()) {
      toast.error('Please enter a password for protection');
      return;
    }

    setIsLoading(true);
    try {
      const finalUrl = computedDestinationUrl || formData.originalUrl.trim();

      // Compute expiry date
      let expiryDate = null;
      if (formData.expiryOption === 'Custom' && formData.customExpiryDate) {
        expiryDate = new Date(formData.customExpiryDate).toISOString();
      } else {
        const foundPreset = EXPIRY_PRESETS.find((p) => p.label === formData.expiryOption);
        if (foundPreset && foundPreset.hours > 0) {
          const d = new Date();
          d.setHours(d.getHours() + foundPreset.hours);
          expiryDate = d.toISOString();
        }
      }

      const payload = {
        originalUrl: finalUrl,
        category: formData.category,
        tags: formData.tags,
        qrConfig: formData.qrConfig || DEFAULT_QR_CONFIG,
      };

      if (formData.customAlias.trim()) payload.customAlias = formData.customAlias.trim();
      if (formData.title.trim()) payload.title = formData.title.trim();
      if (formData.description.trim()) payload.description = formData.description.trim();
      if (formData.enablePassword && formData.password.trim()) payload.password = formData.password.trim();
      if (formData.enableMaxClicks && Number(formData.maxClicks) > 0) {
        payload.maxClicks = parseInt(formData.maxClicks, 10);
      }
      if (expiryDate) payload.expiryDate = expiryDate;
      if (formData.expiredRedirectUrl.trim()) payload.expiredRedirectUrl = formData.expiredRedirectUrl.trim();
      if (formData.iosRedirect.trim()) payload.iosRedirect = formData.iosRedirect.trim();
      if (formData.androidRedirect.trim()) payload.androidRedirect = formData.androidRedirect.trim();
      if (
        formData.utmSource.trim() ||
        formData.utmMedium.trim() ||
        formData.utmCampaign.trim() ||
        formData.utmTerm.trim() ||
        formData.utmContent.trim()
      ) {
        payload.utm = {
          source: formData.utmSource.trim(),
          medium: formData.utmMedium.trim(),
          campaign: formData.utmCampaign.trim(),
          term: formData.utmTerm.trim(),
          content: formData.utmContent.trim(),
        };
      }

      if (formData.routingType === 'ab_test') {
        const totalWeight = formData.variants.reduce((acc, v) => acc + (Number(v.weight) || 0), 0);
        if (totalWeight !== 100) {
          toast.error(`Variant weights must sum to exactly 100% (currently ${totalWeight}%)`);
          setIsLoading(false);
          return;
        }
        for (const v of formData.variants) {
          if (!v.url || !v.url.trim()) {
            toast.error(`Please provide a destination URL for ${v.name}`);
            setIsLoading(false);
            return;
          }
        }
        payload.routingType = 'ab_test';
        payload.variants = formData.variants;
      }

      if (formData.ogTitle?.trim()) payload.ogTitle = formData.ogTitle.trim();
      if (formData.ogDescription?.trim()) payload.ogDescription = formData.ogDescription.trim();
      if (formData.ogImage?.trim()) payload.ogImage = formData.ogImage.trim();

      const result = await linkService.createLink(payload);
      addLink(result.link);
      setCreatedResult(result.link);
      toast.success('Link created successfully!');
    } catch (error) {
      toast.error(
        error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || 'Failed to create link'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyShortUrl = () => {
    if (!createdResult) return;
    navigator.clipboard.writeText(createdResult.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  const downloadQr = (format = 'png') => {
    if (!createdResult?.qrCode) return;
    const a = document.createElement('a');
    a.href = createdResult.qrCode;
    a.download = `${createdResult.shortCode}-qr.${format}`;
    a.click();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={createdResult ? 'Link Created Successfully' : 'Create Enterprise Link'}
        maxWidth="max-w-3xl"
      >
      <AnimatePresence mode="wait">
        {createdResult ? (
          /* Success Screen */
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6 pt-1"
          >
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
                {createdResult.qrCode ? (
                  <img
                    src={createdResult.qrCode}
                    alt="QR code"
                    className="h-24 w-24 rounded-lg bg-white p-1 ring-1 ring-ink-600"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-ink-800 text-paper-500">
                    No QR
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-paper-300">
                    QR Code Asset
                  </p>
                  <p className="text-xs text-paper-500">Ready for print and collateral packaging.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
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
                      <span>PNG</span>
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
                onClick={() => {
                  setFormData(EMPTY_FORM);
                  setCreatedResult(null);
                  setActiveTab('general');
                }}
                className="btn-secondary flex-1"
              >
                Create Another Link
              </button>
              <button type="button" onClick={handleClose} className="btn-primary flex-1">
                Done
              </button>
            </div>
          </motion.div>
        ) : (
          /* Main Creation Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-ink-700 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-ink-700 scrollbar-track-transparent shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold shrink-0 whitespace-nowrap transition-colors ${
                  activeTab === 'general'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-500 hover:text-paper-300'
                }`}
              >
                <Sparkles size={14} />
                <span>General Details</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('utm')}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold shrink-0 whitespace-nowrap transition-colors ${
                  activeTab === 'utm'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-500 hover:text-paper-300'
                }`}
              >
                <Sliders size={14} />
                <span>UTM Studio</span>
                {(formData.utmSource || formData.utmMedium || formData.utmCampaign) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('enterprise')}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold shrink-0 whitespace-nowrap transition-colors ${
                  activeTab === 'enterprise'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-500 hover:text-paper-300'
                }`}
              >
                <ShieldCheck size={14} />
                <span>Security & Access</span>
                {(formData.enablePassword || formData.expiryOption !== 'Never' || formData.enableMaxClicks || formData.expiredRedirectUrl) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('targeting')}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold shrink-0 whitespace-nowrap transition-colors ${
                  activeTab === 'targeting'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-500 hover:text-paper-300'
                }`}
              >
                <Smartphone size={14} />
                <span>Device Targeting</span>
                {(formData.iosRedirect || formData.androidRedirect) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ab_test')}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold shrink-0 whitespace-nowrap transition-colors ${
                  activeTab === 'ab_test'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-500 hover:text-paper-300'
                }`}
              >
                <Split size={14} />
                <span>A/B Split</span>
                {formData.routingType === 'ab_test' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('opengraph')}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold shrink-0 whitespace-nowrap transition-colors ${
                  activeTab === 'opengraph'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-500 hover:text-paper-300'
                }`}
              >
                <Share2 size={14} />
                <span>Social Preview</span>
                {(formData.ogTitle || formData.ogImage) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('qr')}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold shrink-0 whitespace-nowrap transition-colors ${
                  activeTab === 'qr'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-500 hover:text-paper-300'
                }`}
              >
                <QrCode size={14} />
                <span>Custom QR</span>
              </button>
            </div>

            {/* TAB 1: GENERAL DETAILS */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="field-label mb-0" htmlFor="originalUrl">
                      Destination URL *
                    </label>
                    {domain && (
                      <span className="flex items-center gap-1 text-xs text-paper-500">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                          alt=""
                          className="h-3.5 w-3.5 rounded"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        <span>{domain}</span>
                      </span>
                    )}
                  </div>
                  <input
                    id="originalUrl"
                    type="text"
                    required
                    autoFocus
                    placeholder="https://yourcompany.com/landing-page"
                    value={formData.originalUrl}
                    onChange={(e) => setFormData({ ...formData, originalUrl: e.target.value })}
                    className="input"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="field-label mb-0" htmlFor="customAlias">
                        Custom Alias (Optional)
                      </label>
                      <button
                        type="button"
                        onClick={generateRandomAlias}
                        title="Generate random alias"
                        className="flex items-center gap-1 text-xs text-accent-400 hover:underline"
                      >
                        <Dice5 size={12} />
                        <span>Random</span>
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-mono text-paper-500 pointer-events-none">
                        /
                      </span>
                      <input
                        id="customAlias"
                        type="text"
                        placeholder="launch-2026"
                        value={formData.customAlias}
                        onChange={(e) => setFormData({ ...formData, customAlias: e.target.value })}
                        className="input-mono pl-6"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="category">
                      Category
                    </label>
                    <select
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="input"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Direct Password Option on Tab 1 so user never misses it */}
                <div className="rounded-xl border border-ink-700 bg-ink-950/70 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock size={15} className={formData.enablePassword ? 'text-accent-400' : 'text-paper-500'} />
                      <div>
                        <span className="text-xs font-semibold text-paper-100">
                          Password Protection
                        </span>
                        <p className="text-[11px] text-paper-500">
                          Require visitors to enter a password to unlock this destination.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !formData.enablePassword;
                        setFormData({
                          ...formData,
                          enablePassword: next,
                          password: next ? formData.password : '',
                        });
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        formData.enablePassword
                          ? 'bg-accent-400 text-ink-950'
                          : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
                      }`}
                    >
                      {formData.enablePassword ? 'Password Enabled' : 'Add Password'}
                    </button>
                  </div>

                  {formData.enablePassword && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-1.5"
                    >
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required={formData.enablePassword}
                          placeholder="Type secret password for this link..."
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="input font-mono pr-10"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-500 hover:text-paper-200"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-paper-500">
                        Encrypted with bcrypt (10 rounds) before being saved.
                      </p>
                    </motion.div>
                  )}
                </div>

                {/* Direct Usage / Click Limit (Max Opens) on Tab 1 */}
                <div className="rounded-xl border border-ink-700 bg-ink-950/70 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users size={15} className={formData.enableMaxClicks ? 'text-accent-400' : 'text-paper-500'} />
                      <div>
                        <span className="text-xs font-semibold text-paper-100">
                          Click Limit (Max Opens)
                        </span>
                        <p className="text-[11px] text-paper-500">
                          Deactivate this link after a set number of users open it.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !formData.enableMaxClicks;
                        setFormData({
                          ...formData,
                          enableMaxClicks: next,
                          maxClicks: next ? formData.maxClicks || '25' : '',
                        });
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        formData.enableMaxClicks
                          ? 'bg-accent-400 text-ink-950'
                          : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
                      }`}
                    >
                      {formData.enableMaxClicks ? 'Limit Active' : 'Add Limit'}
                    </button>
                  </div>

                  {formData.enableMaxClicks && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-1.5 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          required={formData.enableMaxClicks}
                          placeholder="e.g. 50"
                          value={formData.maxClicks}
                          onChange={(e) => setFormData({ ...formData, maxClicks: e.target.value })}
                          className="input font-mono"
                        />
                        <span className="text-xs text-paper-400 whitespace-nowrap">max clicks</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-paper-500">Presets:</span>
                        {[5, 25, 100, 500].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setFormData({ ...formData, maxClicks: String(preset) })}
                            className={`rounded px-2 py-0.5 text-xs font-mono transition-colors ${
                              formData.maxClicks === String(preset)
                                ? 'bg-accent-400 text-ink-950 font-bold'
                                : 'bg-ink-800 text-paper-300 hover:text-paper-100'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="title">
                      Title (Internal reference)
                    </label>
                    <input
                      id="title"
                      type="text"
                      placeholder="e.g. Q4 Growth Promo"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="tags">
                      Tags (Press Enter)
                    </label>
                    <input
                      id="tags"
                      type="text"
                      placeholder="marketing, promo"
                      value={formData.tagInput}
                      onChange={(e) => setFormData({ ...formData, tagInput: e.target.value })}
                      onKeyDown={handleAddTag}
                      className="input"
                    />
                  </div>
                </div>

                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formData.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-md bg-ink-800 px-2 py-0.5 text-xs text-paper-300 ring-1 ring-ink-600"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => removeTag(t)}
                          className="text-paper-500 hover:text-paper-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div>
                  <label className="field-label" htmlFor="description">
                    Description (Optional)
                  </label>
                  <textarea
                    id="description"
                    rows={2}
                    placeholder="Add operational notes or team context..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input resize-none"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: UTM STUDIO */}
            {activeTab === 'utm' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-paper-400">
                    Add standard marketing attribution parameters to trace leads and clicks.
                  </p>
                </div>

                {/* Presets */}
                <div>
                  <span className="field-label">Quick Campaign Presets</span>
                  <div className="flex flex-wrap gap-1.5">
                    {UTM_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => applyUtmPreset(p)}
                        className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1 text-xs text-paper-300 transition-colors hover:border-accent-400/50 hover:text-paper-100"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="field-label" htmlFor="utmSource">
                      UTM Source
                    </label>
                    <input
                      id="utmSource"
                      type="text"
                      placeholder="google / twitter"
                      value={formData.utmSource}
                      onChange={(e) => setFormData({ ...formData, utmSource: e.target.value })}
                      className="input font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="utmMedium">
                      UTM Medium
                    </label>
                    <input
                      id="utmMedium"
                      type="text"
                      placeholder="cpc / social / email"
                      value={formData.utmMedium}
                      onChange={(e) => setFormData({ ...formData, utmMedium: e.target.value })}
                      className="input font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="utmCampaign">
                      UTM Campaign
                    </label>
                    <input
                      id="utmCampaign"
                      type="text"
                      placeholder="summer_sale_2026"
                      value={formData.utmCampaign}
                      onChange={(e) => setFormData({ ...formData, utmCampaign: e.target.value })}
                      className="input font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="utmTerm">
                      UTM Term (Keywords)
                    </label>
                    <input
                      id="utmTerm"
                      type="text"
                      placeholder="cloud_hosting"
                      value={formData.utmTerm}
                      onChange={(e) => setFormData({ ...formData, utmTerm: e.target.value })}
                      className="input font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="utmContent">
                      UTM Content (Ad variation)
                    </label>
                    <input
                      id="utmContent"
                      type="text"
                      placeholder="blue_banner_v2"
                      value={formData.utmContent}
                      onChange={(e) => setFormData({ ...formData, utmContent: e.target.value })}
                      className="input font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Live Computed URL Preview */}
                {computedDestinationUrl && (
                  <div className="rounded-lg border border-ink-700 bg-ink-950 p-3">
                    <span className="field-label mb-1">Generated Tracked Target URL:</span>
                    <p className="truncate font-mono text-xs text-accent-400">
                      {computedDestinationUrl}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SECURITY & ENTERPRISE CONTROLS */}
            {activeTab === 'enterprise' && (
              <div className="space-y-5">
                {/* Dedicated Password Protection Box */}
                <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock size={16} className="text-accent-400" />
                      <div>
                        <h4 className="text-sm font-semibold text-paper-100">Password Protection</h4>
                        <p className="text-xs text-paper-500">
                          Visitors must enter a password on Linkora's unlock gate to be redirected.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !formData.enablePassword;
                        setFormData({
                          ...formData,
                          enablePassword: next,
                          password: next ? formData.password : '',
                        });
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        formData.enablePassword
                          ? 'bg-accent-400 text-ink-950'
                          : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
                      }`}
                    >
                      {formData.enablePassword ? 'Protection Enabled' : 'Enable Password'}
                    </button>
                  </div>

                  {formData.enablePassword && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-2"
                    >
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required={formData.enablePassword}
                          placeholder="Type secret password for this link..."
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="input font-mono pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-500 hover:text-paper-200"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-paper-500">
                        Passwords are cryptographically hashed using bcrypt before storage.
                      </p>
                    </motion.div>
                  )}
                </div>

                {/* Expiration Settings */}
                <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-accent-400" />
                    <div>
                      <h4 className="text-sm font-semibold text-paper-100">Link Expiration</h4>
                      <p className="text-xs text-paper-500">
                        Automatically disable this link after a set time window.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {EXPIRY_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, expiryOption: preset.label })
                        }
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                          formData.expiryOption === preset.label
                            ? 'bg-accent-400 text-ink-950 shadow-glow'
                            : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, expiryOption: 'Custom' })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                        formData.expiryOption === 'Custom'
                          ? 'bg-accent-400 text-ink-950 shadow-glow'
                          : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
                      }`}
                    >
                      Custom Date
                    </button>
                  </div>

                  {formData.expiryOption === 'Custom' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-2"
                    >
                      <input
                        type="datetime-local"
                        value={formData.customExpiryDate}
                        onChange={(e) =>
                          setFormData({ ...formData, customExpiryDate: e.target.value })
                        }
                        className="input"
                      />
                    </motion.div>
                  )}
                </div>

                {/* Maximum Opens / Click Quota */}
                <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users size={16} className={formData.enableMaxClicks ? 'text-accent-400' : 'text-paper-500'} />
                      <div>
                        <h4 className="text-sm font-semibold text-paper-100">Maximum Opens (Click Quota)</h4>
                        <p className="text-xs text-paper-500">
                          Automatically expire and block this link after a set number of users open it.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !formData.enableMaxClicks;
                        setFormData({
                          ...formData,
                          enableMaxClicks: next,
                          maxClicks: next ? formData.maxClicks || '25' : '',
                        });
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        formData.enableMaxClicks
                          ? 'bg-accent-400 text-ink-950'
                          : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
                      }`}
                    >
                      {formData.enableMaxClicks ? 'Quota Enabled' : 'Enable Limit'}
                    </button>
                  </div>

                  {formData.enableMaxClicks && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-2 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          required={formData.enableMaxClicks}
                          placeholder="e.g. 50"
                          value={formData.maxClicks}
                          onChange={(e) => setFormData({ ...formData, maxClicks: e.target.value })}
                          className="input font-mono"
                        />
                        <span className="text-xs text-paper-400 whitespace-nowrap">max opens</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-paper-500">Presets:</span>
                        {[5, 25, 100, 500].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setFormData({ ...formData, maxClicks: String(preset) })}
                            className={`rounded px-2.5 py-1 text-xs font-mono transition-colors ${
                              formData.maxClicks === String(preset)
                                ? 'bg-accent-400 text-ink-950 font-bold'
                                : 'bg-ink-800 text-paper-300 hover:text-paper-100'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Fallback Destination URL */}
                <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-accent-400" />
                    <div>
                      <h4 className="text-sm font-semibold text-paper-100">Fallback Expired URL (Optional)</h4>
                      <p className="text-xs text-paper-500">
                        Where to send visitors when this link expires or reaches its maximum opens limit.
                      </p>
                    </div>
                  </div>
                  <input
                    type="url"
                    placeholder="https://yourcompany.com/campaign-ended"
                    value={formData.expiredRedirectUrl}
                    onChange={(e) => setFormData({ ...formData, expiredRedirectUrl: e.target.value })}
                    className="input font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {/* TAB 4: DEVICE TARGETING */}
            {activeTab === 'targeting' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-ink-700 bg-ink-950 p-3.5 space-y-1">
                  <span className="text-xs font-semibold text-paper-200">
                    Mobile Deep Linking & OS Routing
                  </span>
                  <p className="text-xs text-paper-500">
                    Linkora automatically inspects visitor devices and redirects iPhone/iPad users to iOS target and Android users to Google Play target.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="field-label" htmlFor="iosRedirect">
                    iOS / iPhone Destination (App Store or Universal Link)
                  </label>
                  <input
                    id="iosRedirect"
                    type="url"
                    placeholder="https://apps.apple.com/app/id123456789"
                    value={formData.iosRedirect}
                    onChange={(e) => setFormData({ ...formData, iosRedirect: e.target.value })}
                    className="input font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="field-label" htmlFor="androidRedirect">
                    Android Destination (Google Play Store or Package Intent)
                  </label>
                  <input
                    id="androidRedirect"
                    type="url"
                    placeholder="https://play.google.com/store/apps/details?id=com.yourapp"
                    value={formData.androidRedirect}
                    onChange={(e) => setFormData({ ...formData, androidRedirect: e.target.value })}
                    className="input font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {/* TAB 5: CUSTOM QR DESIGN */}
            {activeTab === 'qr' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-ink-700 bg-ink-950 p-3.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-accent-400" />
                    <span className="text-xs font-semibold text-paper-100">
                      Pre-configure Link QR Code Style
                    </span>
                  </div>
                  <p className="text-xs text-paper-500">
                    Apply designer presets, custom colors, gradients, logos, or callout frames before creating the link.
                  </p>
                </div>

                <QRCodeCustomizer
                  config={formData.qrConfig || DEFAULT_QR_CONFIG}
                  onChange={(updater) => {
                    setFormData((prev) => ({
                      ...prev,
                      qrConfig: typeof updater === 'function' ? updater(prev.qrConfig || DEFAULT_QR_CONFIG) : updater,
                    }));
                  }}
                  onReset={() => setFormData((prev) => ({ ...prev, qrConfig: DEFAULT_QR_CONFIG }))}
                />
              </div>
            )}

            {/* TAB 6: A/B SPLIT TESTING */}
            {activeTab === 'ab_test' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-ink-700 bg-ink-950 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Split size={16} className="text-accent-400" />
                      <h4 className="text-sm font-semibold text-paper-100">
                        A/B Split Testing & Traffic Routing
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = formData.routingType === 'ab_test' ? 'direct' : 'ab_test';
                        setFormData({ ...formData, routingType: next });
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        formData.routingType === 'ab_test'
                          ? 'bg-accent-400 text-ink-950 shadow-glow'
                          : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
                      }`}
                    >
                      {formData.routingType === 'ab_test' ? 'A/B Split Active' : 'Enable A/B Test'}
                    </button>
                  </div>
                  <p className="text-xs text-paper-400 leading-relaxed">
                    Direct a percentage of visitors to different destination URLs. Uses deterministic sticky hashing (IP + User-Agent) so the same visitor consistently lands on the exact same variant.
                  </p>
                </div>

                {formData.routingType === 'ab_test' ? (
                  <div className="space-y-4">
                    {/* Total weight check */}
                    {(() => {
                      const sum = formData.variants.reduce((acc, v) => acc + (Number(v.weight) || 0), 0);
                      return (
                        <div className={`flex items-center justify-between rounded-lg px-3.5 py-2 text-xs font-mono font-medium ${
                          sum === 100
                            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                        }`}>
                          <span>Total Traffic Allocation: {sum}%</span>
                          <span>{sum === 100 ? '✓ Balanced (100%)' : `Need ${100 - sum}% to reach 100%`}</span>
                        </div>
                      );
                    })()}

                    {/* Variant Rows */}
                    <div className="space-y-3">
                      {formData.variants.map((variant, index) => (
                        <div
                          key={variant.id || index}
                          className="rounded-xl border border-ink-700 bg-ink-900/60 p-3.5 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <input
                              type="text"
                              value={variant.name}
                              onChange={(e) => {
                                const newVariants = [...formData.variants];
                                newVariants[index].name = e.target.value;
                                setFormData({ ...formData, variants: newVariants });
                              }}
                              className="bg-transparent font-semibold text-xs text-paper-100 outline-none border-b border-dashed border-ink-600 focus:border-accent-400 pb-0.5"
                              placeholder={`Variant ${String.fromCharCode(65 + index)}`}
                            />

                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 font-mono text-xs text-accent-400 font-bold">
                                <span>{variant.weight}%</span>
                              </div>
                              {formData.variants.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newVariants = formData.variants.filter((_, i) => i !== index);
                                    setFormData({ ...formData, variants: newVariants });
                                  }}
                                  className="rounded p-1 text-paper-500 hover:text-rose-400 transition-colors"
                                  title="Remove variant"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <input
                              type="url"
                              placeholder="https://yourlandingpage-v1.com"
                              value={variant.url}
                              onChange={(e) => {
                                const newVariants = [...formData.variants];
                                newVariants[index].url = e.target.value;
                                setFormData({ ...formData, variants: newVariants });
                              }}
                              className="input font-mono text-xs"
                            />
                          </div>

                          {/* Slider for weight */}
                          <div className="space-y-1">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={variant.weight}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                const newVariants = [...formData.variants];
                                newVariants[index].weight = val;
                                setFormData({ ...formData, variants: newVariants });
                              }}
                              className="w-full accent-accent-400 cursor-pointer h-1.5 rounded-lg bg-ink-800"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {formData.variants.length < 4 && (
                      <button
                        type="button"
                        onClick={() => {
                          const char = String.fromCharCode(65 + formData.variants.length);
                          setFormData({
                            ...formData,
                            variants: [
                              ...formData.variants,
                              {
                                id: `var_${char.toLowerCase()}_${Date.now()}`,
                                name: `Variant ${char}`,
                                url: '',
                                weight: 20,
                              },
                            ],
                          });
                        }}
                        className="btn-secondary btn-sm w-full"
                      >
                        <Plus size={13} />
                        <span>Add Challenger Variant</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-ink-800 p-6 text-center text-xs text-paper-500">
                    Direct routing is active. Click <strong>Enable A/B Test</strong> above to split incoming visitors across multiple target URLs.
                  </div>
                )}
              </div>
            )}

            {/* TAB 7: SOCIAL OPENGRAPH PREVIEW */}
            {activeTab === 'opengraph' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-ink-700 bg-ink-950 p-3.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <Share2 size={15} className="text-accent-400" />
                    <span className="text-xs font-semibold text-paper-100">
                      Social Preview & OpenGraph Customization
                    </span>
                  </div>
                  <p className="text-xs text-paper-500">
                    When social bots (Slack, Twitter, Discord, iMessage) crawl your short link, Linkora returns these custom tags for rich unfurling before redirecting.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="field-label" htmlFor="ogTitle">Social Card Title</label>
                    <input
                      id="ogTitle"
                      type="text"
                      placeholder="e.g. Exclusive Launch: Linkora Developer Platform"
                      value={formData.ogTitle}
                      onChange={(e) => setFormData({ ...formData, ogTitle: e.target.value })}
                      className="input text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="field-label" htmlFor="ogDescription">Social Card Description</label>
                    <textarea
                      id="ogDescription"
                      rows={2}
                      placeholder="Short compelling summary for Twitter cards, Slack unfurling, and LinkedIn preview..."
                      value={formData.ogDescription}
                      onChange={(e) => setFormData({ ...formData, ogDescription: e.target.value })}
                      className="input text-xs resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="field-label" htmlFor="ogImage">Custom Preview Image URL (og:image)</label>
                    <input
                      id="ogImage"
                      type="url"
                      placeholder="https://yourbrand.com/images/hero-card.png"
                      value={formData.ogImage}
                      onChange={(e) => setFormData({ ...formData, ogImage: e.target.value })}
                      className="input font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Live Social Preview Mock Card */}
                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-paper-400">
                    Live Social Card Unfurl Preview
                  </span>
                  <div className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-md">
                    {formData.ogImage ? (
                      <img
                        src={formData.ogImage}
                        alt="Preview"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        className="h-36 w-full object-cover border-b border-ink-800"
                      />
                    ) : (
                      <div className="flex h-24 w-full items-center justify-center border-b border-ink-800 bg-ink-950 text-xs text-paper-500 font-mono">
                        [No Image URL Specified — Standard Card]
                      </div>
                    )}
                    <div className="p-3.5 space-y-1">
                      <div className="text-[10px] uppercase font-mono text-paper-500">
                        {domain || 'linkora.dev'}
                      </div>
                      <h5 className="font-bold text-xs text-paper-100 truncate">
                        {formData.ogTitle || formData.title || 'Linkora Short Link'}
                      </h5>
                      <p className="text-[11px] text-paper-400 line-clamp-2">
                        {formData.ogDescription || formData.description || 'High-performance link infrastructure and intelligence.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-ink-700 pt-3.5 pb-1 mt-4 bg-ink-900/95 backdrop-blur-sm shrink-0">
              <span className="text-xs text-paper-500">
                {activeTab === 'general'
                  ? 'General'
                  : activeTab === 'utm'
                  ? 'Attribution'
                  : activeTab === 'targeting'
                  ? 'Device Targeting'
                  : activeTab === 'ab_test'
                  ? 'A/B Split'
                  : activeTab === 'opengraph'
                  ? 'Social Preview'
                  : activeTab === 'qr'
                  ? 'Custom QR'
                  : 'Security & Access'}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={handleClose} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isLoading} className="btn-primary">
                  {isLoading ? 'Creating…' : 'Create link'}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </form>
        )}
      </AnimatePresence>
    </Modal>

    <QRCodeModal
      open={showQrModal}
      onClose={() => setShowQrModal(false)}
      link={createdResult}
      onSaveSuccess={(updated) => setCreatedResult(updated)}
    />
  </>
  );
}
