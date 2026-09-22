import { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  BarChart3,
  Power,
  Trash2,
  Calendar,
  Lock,
  Tag,
  Download,
  Save,
  Globe,
  Clock,
  ShieldAlert,
  Eye,
  EyeOff,
  Users,
  Smartphone,
  Sliders,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Link as RouterLink } from 'react-router-dom';
import { linkService } from '../../services';
import useLinkStore from '../../context/linkStore';
import { useConfirm } from '../../context/ConfirmContext';

const CATEGORIES = ['marketing', 'sales', 'product', 'social', 'personal', 'other'];

export default function LinkDrawer({ link, open, onClose }) {
  const confirm = useConfirm();
  const { updateLink, removeLink } = useLinkStore();
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [originalUrl, setOriginalUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('marketing');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');

  // Password Protection
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [removePassword, setRemovePassword] = useState(false);

  // Click Limit (Max Opens)
  const [maxClicks, setMaxClicks] = useState('');
  const [enableMaxClicks, setEnableMaxClicks] = useState(false);
  const [removeMaxClicks, setRemoveMaxClicks] = useState(false);

  // Expiration
  const [expiryDate, setExpiryDate] = useState('');
  const [removeExpiryDate, setRemoveExpiryDate] = useState(false);

  // Fallback Expired URL
  const [expiredRedirectUrl, setExpiredRedirectUrl] = useState('');

  // Device Targeting
  const [iosRedirect, setIosRedirect] = useState('');
  const [androidRedirect, setAndroidRedirect] = useState('');

  // UTM Attribution
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');

  useEffect(() => {
    if (link) {
      setOriginalUrl(link.originalUrl || '');
      setTitle(link.title || '');
      setDescription(link.description || '');
      setCategory(link.category || 'other');
      setTags(link.tags || []);
      setNewPassword('');
      setShowPassword(false);
      setRemovePassword(false);

      setMaxClicks(link.maxClicks ? String(link.maxClicks) : '');
      setEnableMaxClicks(Boolean(link.maxClicks));
      setRemoveMaxClicks(false);

      setExpiryDate(
        link.expiryDate ? new Date(link.expiryDate).toISOString().slice(0, 16) : ''
      );
      setRemoveExpiryDate(false);

      setExpiredRedirectUrl(link.expiredRedirectUrl || '');
      setIosRedirect(link.iosRedirect || '');
      setAndroidRedirect(link.androidRedirect || '');

      setUtmSource(link.utm?.source || '');
      setUtmMedium(link.utm?.medium || '');
      setUtmCampaign(link.utm?.campaign || '');

      setIsEditing(false);
    }
  }, [link]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!link) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(link.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      const data = await linkService.toggleLinkStatus(link._id);
      updateLink(data.link);
      toast.success(data.link.isActive ? 'Link activated' : 'Link paused');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update link status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Short Link',
      message: 'Are you sure you want to delete this short link? The redirect URL will stop working immediately and all analytics data will be permanently deleted.',
      confirmText: 'Delete Link',
      cancelText: 'Cancel',
      variant: 'danger',
      detail: `${link.shortUrl} ➔ ${link.originalUrl}`,
    });
    if (!confirmed) return;

    setIsUpdating(true);
    try {
      await linkService.deleteLink(link._id);
      removeLink(link._id);
      toast.success('Link deleted');
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete link');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const payload = {
        title,
        description,
        category,
        tags,
      };

      // Destination URL
      if (originalUrl.trim() && originalUrl.trim() !== link.originalUrl) {
        payload.originalUrl = originalUrl.trim();
      }

      // Password
      if (removePassword) {
        payload.removePassword = true;
      } else if (newPassword.trim()) {
        payload.password = newPassword.trim();
      }

      // Max Clicks
      if (removeMaxClicks || (!enableMaxClicks && link.maxClicks)) {
        payload.removeMaxClicks = true;
      } else if (enableMaxClicks && Number(maxClicks) > 0) {
        payload.maxClicks = parseInt(maxClicks, 10);
      }

      // Expiry Date
      if (removeExpiryDate) {
        payload.removeExpiryDate = true;
      } else if (expiryDate) {
        payload.expiryDate = new Date(expiryDate).toISOString();
      }

      // Fallback Expired URL
      if (expiredRedirectUrl.trim()) {
        payload.expiredRedirectUrl = expiredRedirectUrl.trim();
      } else if (link.expiredRedirectUrl && !expiredRedirectUrl.trim()) {
        payload.removeExpiredRedirectUrl = true;
      }

      // Device Targeting
      if (iosRedirect.trim()) {
        payload.iosRedirect = iosRedirect.trim();
      } else if (link.iosRedirect && !iosRedirect.trim()) {
        payload.removeIosRedirect = true;
      }

      if (androidRedirect.trim()) {
        payload.androidRedirect = androidRedirect.trim();
      } else if (link.androidRedirect && !androidRedirect.trim()) {
        payload.removeAndroidRedirect = true;
      }

      // UTM Attribution
      if (utmSource.trim() || utmMedium.trim() || utmCampaign.trim()) {
        payload.utm = {
          source: utmSource.trim(),
          medium: utmMedium.trim(),
          campaign: utmCampaign.trim(),
        };
      }

      const updated = await linkService.updateLink(link._id, payload);
      updateLink(updated.link);
      setIsEditing(false);
      setNewPassword('');
      setRemovePassword(false);
      setRemoveMaxClicks(false);
      setRemoveExpiryDate(false);
      toast.success('Link updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update link');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.trim().replace(/^,+|,+$/g, '');
      if (val && !tags.includes(val)) {
        setTags([...tags, val]);
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = (t) => {
    setTags(tags.filter((item) => item !== t));
  };

  const downloadQr = () => {
    if (!link.qrCode) return;
    const a = document.createElement('a');
    a.href = link.qrCode;
    a.download = `${link.shortCode}-qr.png`;
    a.click();
  };

  const isQuotaFull = link.maxClicks && (link.clicks || 0) >= link.maxClicks;
  const isExpired = link.expiryDate && new Date(link.expiryDate) < new Date();

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-screen max-w-md bg-ink-900 border-l border-ink-700 shadow-2xl flex flex-col"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-ink-700 bg-ink-950/70">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {link.abuseFlag ? (
                      <span className="badge-danger text-xs">
                        <ShieldAlert size={12} /> Flagged
                      </span>
                    ) : isQuotaFull ? (
                      <span className="badge-danger text-xs font-mono">Limit Reached</span>
                    ) : isExpired ? (
                      <span className="badge-danger text-xs">Expired</span>
                    ) : link.isActive ? (
                      <span className="badge-success text-xs">Active</span>
                    ) : (
                      <span className="badge-neutral text-xs">Paused</span>
                    )}
                    <span className="font-mono text-xs text-paper-400">/{link.shortCode}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleToggle}
                      disabled={isUpdating}
                      className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                      title={link.isActive ? 'Pause link' : 'Activate link'}
                    >
                      <Power
                        size={16}
                        className={link.isActive ? 'text-success' : 'text-paper-500'}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <h2 className="text-lg font-bold text-paper-100 truncate">
                    {link.title || 'Untitled Link'}
                  </h2>
                  <p className="text-xs text-paper-500 truncate mt-0.5">
                    Created on{' '}
                    {new Date(link.createdAt).toLocaleDateString(undefined, {
                      dateStyle: 'long',
                    })}
                  </p>
                </div>
              </div>

              {/* Drawer Content Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
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

                {/* Performance Metrics Card */}
                <div className="panel p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-paper-400">
                      Performance Summary
                    </span>
                    <RouterLink
                      to={`/analytics/${link._id}`}
                      className="flex items-center gap-1 text-xs font-semibold text-accent-400 hover:underline"
                    >
                      <span>Full Analytics</span>
                      <BarChart3 size={13} />
                    </RouterLink>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="rounded-lg bg-ink-800 p-3">
                      <span className="text-[11px] text-paper-500">Total Clicks</span>
                      <p className="font-mono text-xl font-bold text-paper-100 mt-0.5">
                        {link.clicks ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-ink-800 p-3">
                      <span className="text-[11px] text-paper-500">Last Accessed</span>
                      <p className="text-xs font-medium text-paper-300 mt-1 truncate">
                        {link.lastAccessedAt
                          ? new Date(link.lastAccessedAt).toLocaleDateString()
                          : 'Never'}
                      </p>
                    </div>
                  </div>

                  {/* Click Quota Progress Bar */}
                  {link.maxClicks && link.maxClicks > 0 && (
                    <div className="rounded-lg border border-ink-700 bg-ink-950/70 p-3 space-y-2 mt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-paper-300">
                          <Users size={13} className="text-accent-400" />
                          <span>Click Quota</span>
                        </span>
                        <span className="font-mono text-paper-200">
                          {link.clicks ?? 0} / {link.maxClicks} opens (
                          {Math.min(
                            100,
                            Math.round(((link.clicks || 0) / link.maxClicks) * 100)
                          )}
                          %)
                        </span>
                      </div>

                      {/* Bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
                        <div
                          className={`h-full transition-all duration-300 ${
                            (link.clicks || 0) >= link.maxClicks
                              ? 'bg-danger'
                              : (link.clicks || 0) / link.maxClicks >= 0.8
                              ? 'bg-warning'
                              : 'bg-accent-400'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(((link.clicks || 0) / link.maxClicks) * 100)
                            )}%`,
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-paper-500">
                        <span>
                          {(link.clicks || 0) >= link.maxClicks ? (
                            <span className="text-danger font-semibold">
                              Limit reached — link expired
                            </span>
                          ) : (
                            `${Math.max(0, link.maxClicks - (link.clicks || 0))} opens remaining`
                          )}
                        </span>
                        <span>Target: {link.maxClicks} max</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* QR Code Section */}
                {link.qrCode && (
                  <div className="panel p-4 flex items-center gap-4">
                    <img
                      src={link.qrCode}
                      alt="QR Code"
                      className="h-20 w-20 rounded-lg bg-white p-1 ring-1 ring-ink-600 shrink-0"
                    />
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-paper-300">
                        QR Asset Ready
                      </h4>
                      <p className="text-xs text-paper-500">
                        Instant scan code for posters, packaging, and marketing collateral.
                      </p>
                      <button
                        type="button"
                        onClick={downloadQr}
                        className="btn-secondary btn-sm"
                      >
                        <Download size={13} />
                        <span>Download PNG</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Metadata, Security & Routing Options */}
                <div className="panel p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-paper-400">
                      Settings, Security & Routing
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditing(!isEditing)}
                      className="text-xs text-accent-400 hover:underline font-medium"
                    >
                      {isEditing ? 'Cancel' : 'Edit Details'}
                    </button>
                  </div>

                  {isEditing ? (
                    <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
                      <div>
                        <label className="field-label" htmlFor="drawerTitle">
                          Title
                        </label>
                        <input
                          id="drawerTitle"
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="input text-xs"
                        />
                      </div>

                      <div>
                        <label className="field-label" htmlFor="drawerCategory">
                          Category
                        </label>
                        <select
                          id="drawerCategory"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="input text-xs"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="field-label" htmlFor="drawerDesc">
                          Description
                        </label>
                        <textarea
                          id="drawerDesc"
                          rows={2}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="input resize-none text-xs"
                        />
                      </div>

                      <div>
                        <label className="field-label" htmlFor="drawerTags">
                          Tags (Press Enter)
                        </label>
                        <input
                          id="drawerTags"
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={handleAddTag}
                          placeholder="Add tag..."
                          className="input text-xs"
                        />
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((t) => (
                            <span key={t} className="badge-neutral text-xs">
                              #{t}
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(t)}
                                className="ml-1 text-paper-500 hover:text-paper-100"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Password Protection */}
                      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <label
                            className="field-label mb-0 flex items-center gap-1.5"
                            htmlFor="drawerPassword"
                          >
                            <Lock size={13} className="text-accent-400" />
                            <span>Password Protection</span>
                          </label>
                          {link.password && !removePassword && (
                            <button
                              type="button"
                              onClick={() => setRemovePassword(true)}
                              className="text-[11px] text-danger hover:underline"
                            >
                              Remove password
                            </button>
                          )}
                          {removePassword && (
                            <button
                              type="button"
                              onClick={() => setRemovePassword(false)}
                              className="text-[11px] text-accent-400 hover:underline"
                            >
                              Undo remove
                            </button>
                          )}
                        </div>

                        {removePassword ? (
                          <p className="text-xs text-danger/80">
                            Password protection will be removed when you save.
                          </p>
                        ) : (
                          <div className="relative">
                            <input
                              id="drawerPassword"
                              type={showPassword ? 'text' : 'password'}
                              placeholder={
                                link.password
                                  ? 'Leave blank to keep current password'
                                  : 'Enter secret password to protect'
                              }
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="input font-mono pr-10 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-500 hover:text-paper-200"
                              tabIndex={-1}
                            >
                              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Click Limit (Max Opens) */}
                      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <label
                            className="field-label mb-0 flex items-center gap-1.5"
                            htmlFor="drawerMaxClicks"
                          >
                            <Users size={13} className="text-accent-400" />
                            <span>Click Limit (Max Opens)</span>
                          </label>
                          {link.maxClicks && !removeMaxClicks && (
                            <button
                              type="button"
                              onClick={() => {
                                setRemoveMaxClicks(true);
                                setEnableMaxClicks(false);
                              }}
                              className="text-[11px] text-danger hover:underline"
                            >
                              Remove limit
                            </button>
                          )}
                          {removeMaxClicks && (
                            <button
                              type="button"
                              onClick={() => {
                                setRemoveMaxClicks(false);
                                setEnableMaxClicks(true);
                              }}
                              className="text-[11px] text-accent-400 hover:underline"
                            >
                              Undo remove
                            </button>
                          )}
                          {!link.maxClicks && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = !enableMaxClicks;
                                setEnableMaxClicks(next);
                                if (next && !maxClicks) setMaxClicks('50');
                              }}
                              className={`text-[11px] font-semibold ${
                                enableMaxClicks
                                  ? 'text-accent-400'
                                  : 'text-paper-400 hover:text-paper-200'
                              }`}
                            >
                              {enableMaxClicks ? 'Enabled' : 'Add limit'}
                            </button>
                          )}
                        </div>

                        {removeMaxClicks ? (
                          <p className="text-xs text-danger/80">
                            Click limit will be removed on save (unlimited opens allowed).
                          </p>
                        ) : enableMaxClicks ? (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center gap-2">
                              <input
                                id="drawerMaxClicks"
                                type="number"
                                min="1"
                                placeholder="e.g. 50"
                                value={maxClicks}
                                onChange={(e) => setMaxClicks(e.target.value)}
                                className="input font-mono text-xs"
                              />
                              <span className="text-xs text-paper-400 whitespace-nowrap">
                                max opens
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-paper-500">Presets:</span>
                              {[5, 25, 100, 500].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setMaxClicks(String(preset))}
                                  className={`rounded px-2 py-0.5 text-xs font-mono transition-colors ${
                                    maxClicks === String(preset)
                                      ? 'bg-accent-400 text-ink-950 font-bold'
                                      : 'bg-ink-800 text-paper-300 hover:text-paper-100'
                                  }`}
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-paper-500">
                            No limit set (unlimited opens allowed).
                          </p>
                        )}
                      </div>

                      {/* Expiration Settings */}
                      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="field-label mb-0 flex items-center gap-1.5">
                            <Calendar size={13} className="text-accent-400" />
                            <span>Link Expiration</span>
                          </label>
                          {link.expiryDate && !removeExpiryDate && (
                            <button
                              type="button"
                              onClick={() => {
                                setRemoveExpiryDate(true);
                                setExpiryDate('');
                              }}
                              className="text-[11px] text-danger hover:underline"
                            >
                              Remove expiry
                            </button>
                          )}
                          {removeExpiryDate && (
                            <button
                              type="button"
                              onClick={() => setRemoveExpiryDate(false)}
                              className="text-[11px] text-accent-400 hover:underline"
                            >
                              Undo remove
                            </button>
                          )}
                        </div>

                        {removeExpiryDate ? (
                          <p className="text-xs text-danger/80">
                            Expiration will be removed on save (link will never expire).
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <input
                              type="datetime-local"
                              value={expiryDate}
                              onChange={(e) => setExpiryDate(e.target.value)}
                              className="input text-xs"
                            />
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-paper-500">Presets:</span>
                              {[
                                { label: '24h', hours: 24 },
                                { label: '7d', hours: 24 * 7 },
                                { label: '30d', hours: 24 * 30 },
                              ].map((p) => (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() => {
                                    const d = new Date();
                                    d.setHours(d.getHours() + p.hours);
                                    setExpiryDate(d.toISOString().slice(0, 16));
                                  }}
                                  className="rounded px-2 py-0.5 text-xs font-mono bg-ink-800 text-paper-300 hover:text-paper-100 transition-colors"
                                >
                                  +{p.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Fallback Expired URL */}
                      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
                        <label
                          className="field-label mb-0 flex items-center gap-1.5"
                          htmlFor="drawerFallback"
                        >
                          <Globe size={13} className="text-accent-400" />
                          <span>Fallback Expired URL</span>
                        </label>
                        <input
                          id="drawerFallback"
                          type="url"
                          placeholder="https://yourcompany.com/campaign-ended"
                          value={expiredRedirectUrl}
                          onChange={(e) => setExpiredRedirectUrl(e.target.value)}
                          className="input font-mono text-xs"
                        />
                        <p className="text-[11px] text-paper-500">
                          Where to redirect users when link expires or max quota is reached.
                        </p>
                      </div>

                      {/* Mobile & Device Targeting */}
                      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2.5">
                        <label className="field-label mb-0 flex items-center gap-1.5">
                          <Smartphone size={13} className="text-accent-400" />
                          <span>Device Targeting (Deep Linking)</span>
                        </label>
                        <div>
                          <span className="text-[11px] text-paper-400 block mb-1">
                            iOS / iPhone Destination:
                          </span>
                          <input
                            type="url"
                            placeholder="https://apps.apple.com/app/id..."
                            value={iosRedirect}
                            onChange={(e) => setIosRedirect(e.target.value)}
                            className="input font-mono text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] text-paper-400 block mb-1">
                            Android Destination:
                          </span>
                          <input
                            type="url"
                            placeholder="https://play.google.com/store/apps/details?id=..."
                            value={androidRedirect}
                            onChange={(e) => setAndroidRedirect(e.target.value)}
                            className="input font-mono text-xs"
                          />
                        </div>
                      </div>

                      {/* UTM Attribution */}
                      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
                        <label className="field-label mb-0 flex items-center gap-1.5">
                          <Sliders size={13} className="text-accent-400" />
                          <span>UTM Attribution Parameters</span>
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="Source"
                            value={utmSource}
                            onChange={(e) => setUtmSource(e.target.value)}
                            className="input font-mono text-[11px]"
                          />
                          <input
                            type="text"
                            placeholder="Medium"
                            value={utmMedium}
                            onChange={(e) => setUtmMedium(e.target.value)}
                            className="input font-mono text-[11px]"
                          />
                          <input
                            type="text"
                            placeholder="Campaign"
                            value={utmCampaign}
                            onChange={(e) => setUtmCampaign(e.target.value)}
                            className="input font-mono text-[11px]"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="btn-primary btn-sm w-full mt-2"
                      >
                        <Save size={13} />
                        <span>Save Changes</span>
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-2.5 pt-1 text-xs text-paper-300">
                      {link.description && (
                        <div>
                          <span className="text-paper-500 block mb-0.5">Description:</span>
                          <p className="text-paper-200">{link.description}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-paper-500">Category:</span>
                        <span className="capitalize font-medium text-paper-100">
                          {link.category || 'other'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-paper-500">Password:</span>
                        {link.password ? (
                          <span className="flex items-center gap-1 text-accent-400 font-medium">
                            <Lock size={12} /> Active (Encrypted)
                          </span>
                        ) : (
                          <span className="text-paper-400">None</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-paper-500">Click Limit:</span>
                        {link.maxClicks ? (
                          <span className="font-mono text-paper-200 flex items-center gap-1">
                            <Users size={12} className="text-accent-400" />
                            <span>
                              {link.clicks ?? 0} / {link.maxClicks} opens
                            </span>
                            {isQuotaFull && (
                              <span className="badge-danger text-[10px] ml-1">Reached</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-paper-400">Unlimited opens</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-paper-500">Expiration:</span>
                        {link.expiryDate ? (
                          <span
                            className={
                              isExpired
                                ? 'text-danger font-medium'
                                : 'text-paper-200 font-medium'
                            }
                          >
                            {isExpired
                              ? `Expired (${new Date(link.expiryDate).toLocaleDateString()})`
                              : `Expires on ${new Date(link.expiryDate).toLocaleDateString()}`}
                          </span>
                        ) : (
                          <span className="text-paper-400">Never expires</span>
                        )}
                      </div>

                      {link.expiredRedirectUrl && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-paper-500">Fallback URL:</span>
                          <span className="font-mono text-xs text-accent-400 truncate max-w-[200px]">
                            {link.expiredRedirectUrl}
                          </span>
                        </div>
                      )}

                      {(link.iosRedirect || link.androidRedirect) && (
                        <div className="pt-2 border-t border-ink-800 space-y-1">
                          <span className="text-paper-500 block mb-1">
                            Device-Specific Destinations:
                          </span>
                          {link.iosRedirect && (
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-paper-400 flex items-center gap-1">
                                <Smartphone size={11} className="text-accent-400" /> iOS Target:
                              </span>
                              <span className="font-mono text-accent-400 truncate max-w-[180px]">
                                {link.iosRedirect}
                              </span>
                            </div>
                          )}
                          {link.androidRedirect && (
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-paper-400 flex items-center gap-1">
                                <Smartphone size={11} className="text-accent-400" /> Android Target:
                              </span>
                              <span className="font-mono text-accent-400 truncate max-w-[180px]">
                                {link.androidRedirect}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {(link.utm?.source || link.utm?.medium || link.utm?.campaign) && (
                        <div className="pt-2 border-t border-ink-800 space-y-1">
                          <span className="text-paper-500 block mb-1">UTM Attribution:</span>
                          <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                            {link.utm.source && (
                              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-paper-300">
                                src:{link.utm.source}
                              </span>
                            )}
                            {link.utm.medium && (
                              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-paper-300">
                                med:{link.utm.medium}
                              </span>
                            )}
                            {link.utm.campaign && (
                              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-accent-400">
                                camp:{link.utm.campaign}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {link.tags?.length > 0 && (
                        <div className="pt-2 border-t border-ink-800">
                          <span className="text-paper-500 block mb-1">Tags:</span>
                          <div className="flex flex-wrap gap-1">
                            {link.tags.map((t) => (
                              <span key={t} className="badge-neutral text-xs">
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="border-t border-ink-700 p-4 bg-ink-950 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isUpdating}
                  className="btn-danger btn-sm"
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
                <RouterLink
                  to={`/analytics/${link._id}`}
                  className="btn-primary btn-sm flex items-center gap-1.5"
                >
                  <BarChart3 size={13} />
                  <span>Open Analytics</span>
                </RouterLink>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
