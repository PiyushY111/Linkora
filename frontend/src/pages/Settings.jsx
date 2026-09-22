import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  User as UserIcon,
  Link as LinkIcon,
  Shield,
  BarChart3,
  AlertTriangle,
  Download,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  Laptop,
  Check,
  Save,
  Palette,
  FileSpreadsheet,
  Globe,
  Bell,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '../components/layout/AppShell';
import { useConfirm } from '../context/ConfirmContext';
import { authService, analyticsService } from '../services';
import useAuthStore from '../context/authStore';

const AVATAR_COLORS = [
  { id: 'accent', label: 'Lime Accent', bg: 'bg-[#C6FF3D] text-[#0A0A0B]', border: 'border-[#C6FF3D]' },
  { id: 'indigo', label: 'Indigo', bg: 'bg-[#6366F1] text-white', border: 'border-[#6366F1]' },
  { id: 'violet', label: 'Violet', bg: 'bg-[#8B5CF6] text-white', border: 'border-[#8B5CF6]' },
  { id: 'cyan', label: 'Cyan', bg: 'bg-[#06B6D4] text-[#0A0A0B]', border: 'border-[#06B6D4]' },
  { id: 'rose', label: 'Rose', bg: 'bg-[#F43F5E] text-white', border: 'border-[#F43F5E]' },
];

const LINK_CATEGORIES = [
  { id: 'marketing', label: 'Marketing' },
  { id: 'sales', label: 'Sales' },
  { id: 'product', label: 'Product' },
  { id: 'social', label: 'Social' },
  { id: 'personal', label: 'Personal' },
  { id: 'other', label: 'Other' },
];

const EXPIRATION_PRESETS = [
  { days: 0, label: 'No Expiration (Permanent)' },
  { days: 1, label: '24 Hours' },
  { days: 7, label: '7 Days' },
  { days: 30, label: '30 Days' },
];

const ANALYTICS_RANGES = [
  { id: '24h', label: 'Last 24 Hours' },
  { id: '7d', label: 'Last 7 Days (Default)' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'all', label: 'All Time' },
];

export default function Settings() {
  const confirm = useConfirm();
  const { user, setUser, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');

  // Profile Form State
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarColor, setAvatarColor] = useState('accent');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Link Defaults State
  const [defaultCategory, setDefaultCategory] = useState('marketing');
  const [defaultExpiration, setDefaultExpiration] = useState(0);
  const [defaultUtmSource, setDefaultUtmSource] = useState('');
  const [defaultUtmMedium, setDefaultUtmMedium] = useState('');
  const [defaultUtmCampaign, setDefaultUtmCampaign] = useState('');
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Analytics & Privacy State
  const [analyticsRange, setAnalyticsRange] = useState('7d');
  const [anonymizeIps, setAnonymizeIps] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // Data & Danger Zone State
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Hydrate local state from current user data
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setBio(user.bio || '');
      setAvatarColor(user.avatarColor || 'accent');

      setDefaultCategory(user.defaultLinkCategory || 'marketing');
      setDefaultExpiration(user.defaultExpirationDays || 0);
      setDefaultUtmSource(user.defaultUtm?.source || '');
      setDefaultUtmMedium(user.defaultUtm?.medium || '');
      setDefaultUtmCampaign(user.defaultUtm?.campaign || '');

      setTwoFactorEnabled(!!user.twoFactorEnabled);
      setAnalyticsRange(user.defaultAnalyticsRange || '7d');
      setAnonymizeIps(!!user.anonymizeVisitorIps);
      setEmailNotifications(user.preferences?.emailNotifications ?? true);
    }
  }, [user]);

  // Save Profile Handler
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await authService.updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        avatarColor,
      });
      setUser(res.user);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Save Link Defaults Handler
  const handleSaveDefaults = async (e) => {
    e.preventDefault();
    setIsSavingDefaults(true);
    try {
      const res = await authService.updateProfile({
        defaultLinkCategory: defaultCategory,
        defaultExpirationDays: Number(defaultExpiration),
        defaultUtm: {
          source: defaultUtmSource.trim(),
          medium: defaultUtmMedium.trim(),
          campaign: defaultUtmCampaign.trim(),
        },
      });
      setUser(res.user);
      toast.success('Link creation defaults saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save defaults');
    } finally {
      setIsSavingDefaults(false);
    }
  };

  // Change Password Handler
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      return toast.error('Please enter your current password');
    }
    if (newPassword.length < 6) {
      return toast.error('New password must be at least 6 characters');
    }
    if (newPassword !== confirmPassword) {
      return toast.error('New passwords do not match');
    }

    setIsUpdatingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Toggle 2FA Handler
  const handleToggle2Fa = async () => {
    const nextState = !twoFactorEnabled;
    try {
      const res = await authService.updateProfile({ twoFactorEnabled: nextState });
      setTwoFactorEnabled(nextState);
      setUser(res.user);
      toast.success(nextState ? '2FA protection enabled' : '2FA protection disabled');
    } catch {
      toast.error('Failed to update 2FA status');
    }
  };

  // Save Analytics & Privacy Preferences Handler
  const handleSavePreferences = async (e) => {
    e.preventDefault();
    setIsSavingPreferences(true);
    try {
      const res = await authService.updateProfile({
        defaultAnalyticsRange: analyticsRange,
        anonymizeVisitorIps: anonymizeIps,
        preferences: {
          ...user?.preferences,
          emailNotifications,
        },
      });
      setUser(res.user);
      toast.success('Preferences updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update preferences');
    } finally {
      setIsSavingPreferences(false);
    }
  };

  // Export Account Data (JSON)
  const handleExportJson = async () => {
    setIsExportingJson(true);
    try {
      const data = await authService.exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linkly-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Account JSON archive exported');
    } catch {
      toast.error('Failed to export account data');
    } finally {
      setIsExportingJson(false);
    }
  };

  // Export Analytics (CSV)
  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    try {
      const blobData = await analyticsService.exportAnalytics();
      const url = window.URL.createObjectURL(new Blob([blobData]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `linkly-clicks-stream-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Analytics CSV export downloaded');
    } catch {
      toast.error('Failed to export analytics CSV');
    } finally {
      setIsExportingCsv(false);
    }
  };

  // Delete Account Handler
  const handleDeleteAccount = async () => {
    const confirmed = await confirm({
      title: 'Permanently Delete Your Account',
      message:
        'This action is irreversible. All of your short links, redirect configurations, webhooks, and analytics history will be permanently deleted from our servers.',
      confirmText: 'Delete Everything Permanently',
      cancelText: 'Keep My Account',
      variant: 'danger',
      detail: `Account: ${user?.email}`,
    });
    if (!confirmed) return;

    setIsDeletingAccount(true);
    try {
      await authService.deleteAccount();
      toast.success('Account deleted successfully');
      logout();
      window.location.href = '/register';
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete account');
      setIsDeletingAccount(false);
    }
  };

  const selectedAvatar = AVATAR_COLORS.find((c) => c.id === avatarColor) || AVATAR_COLORS[0];
  const userInitial = (user?.name || user?.email || 'U')[0].toUpperCase();

  return (
    <>
      <Helmet>
        <title>Settings & Preferences — Linkly</title>
      </Helmet>
      <AppShell>
        {/* Header */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge text-[10px] bg-accent-400/10 text-accent-400 border border-accent-400/25">
                CONFIGURATION
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-paper-100">
              Settings & Preferences
            </h1>
            <p className="text-xs text-paper-500">
              Manage your personal profile, link creation defaults, security credentials, and data exports.
            </p>
          </div>
        </div>

        {/* Tab Navigation Rail */}
        <div className="mb-8 flex overflow-x-auto border-b border-ink-700 pb-px scrollbar-none gap-2">
          {[
            { id: 'profile', label: 'Profile & Account', icon: UserIcon },
            { id: 'defaults', label: 'Link Defaults', icon: LinkIcon },
            { id: 'security', label: 'Security & Sessions', icon: Shield },
            { id: 'preferences', label: 'Analytics & Privacy', icon: BarChart3 },
            { id: 'data', label: 'Data & Danger Zone', icon: AlertTriangle },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'border-accent-400 text-accent-400 bg-ink-800/40'
                    : 'border-transparent text-paper-400 hover:text-paper-100 hover:bg-ink-800/20'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: Profile & Account */}
        {/* ========================================================================= */}
        {activeTab === 'profile' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-4xl"
          >
            {/* Profile Information Card */}
            <div className="panel p-6">
              <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
                <UserIcon size={18} className="text-accent-400" />
                <span>Personal Profile & Identity</span>
              </h2>
              <p className="mt-1 text-xs text-paper-500">
                Your visual avatar and name appear across your links and analytics dashboards.
              </p>

              <form onSubmit={handleSaveProfile} className="mt-6 space-y-6">
                {/* Visual Avatar Customizer */}
                <div>
                  <label className="field-label">Avatar Accent Theme</label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {/* Big Avatar Badge */}
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-2xl font-bold text-xl shadow-lg transition-transform duration-200 ${selectedAvatar.bg}`}
                    >
                      {userInitial}
                    </div>

                    {/* Color Swatches */}
                    <div>
                      <div className="flex items-center gap-2.5">
                        {AVATAR_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setAvatarColor(c.id)}
                            className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all border-2 ${
                              avatarColor === c.id ? `${c.border} scale-110 shadow-md` : 'border-transparent opacity-70 hover:opacity-100'
                            } ${c.bg}`}
                            title={c.label}
                          >
                            {avatarColor === c.id && <Check size={14} className="stroke-[3]" />}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] text-paper-500">
                        Selected: <span className="text-paper-300 font-medium">{selectedAvatar.label}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="profile-name">
                      Full Name
                    </label>
                    <input
                      id="profile-name"
                      type="text"
                      className="input"
                      placeholder="e.g. Satoshi Nakamoto"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="profile-email">
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        id="profile-email"
                        type="email"
                        className="input opacity-60 cursor-not-allowed pr-24"
                        value={user?.email || ''}
                        disabled
                      />
                      <span className="absolute right-2.5 top-2.5 badge text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                        <CheckCircle2 size={11} className="mr-0.5" /> Verified
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="field-label" htmlFor="profile-bio">
                    Bio / Description
                  </label>
                  <textarea
                    id="profile-bio"
                    className="input"
                    rows="3"
                    placeholder="Brief description of your projects or organization..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={500}
                  />
                  <div className="mt-1 text-right text-[11px] text-paper-500">
                    {bio.length}/500 characters
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" className="btn-primary" disabled={isSavingProfile}>
                    <Save size={15} />
                    <span>{isSavingProfile ? 'Saving...' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Account Metadata Telemetry Card */}
            <div className="panel p-6">
              <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-400" />
                <span>Account Telemetry</span>
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-ink-700 bg-ink-950 p-4">
                  <div className="text-xs text-paper-500">Member Since</div>
                  <div className="mt-1 text-base font-semibold text-paper-100 flex items-center gap-1.5">
                    <Clock size={15} className="text-accent-400" />
                    <span>
                      {user?.createdAt
                        ? new Date(user.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Active'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-ink-700 bg-ink-950 p-4">
                  <div className="text-xs text-paper-500">Lifetime Traffic Routed</div>
                  <div className="mt-1 text-base font-semibold text-paper-100 flex items-center gap-1.5">
                    <BarChart3 size={15} className="text-cyan-400" />
                    <span>{(user?.totalClicks || 0).toLocaleString()} clicks</span>
                  </div>
                </div>

                <div className="rounded-xl border border-ink-700 bg-ink-950 p-4">
                  <div className="text-xs text-paper-500">Account Status</div>
                  <div className="mt-1 text-base font-semibold text-emerald-400 flex items-center gap-1.5">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Healthy & Active</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: Link Provisioning Defaults */}
        {/* ========================================================================= */}
        {activeTab === 'defaults' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-4xl"
          >
            <div className="panel p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
                    <LinkIcon size={18} className="text-accent-400" />
                    <span>Default Link Creation Presets</span>
                  </h2>
                  <p className="mt-1 text-xs text-paper-500">
                    Set standard values that automatically pre-fill whenever you shorten a link on Linkly.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveDefaults} className="mt-6 space-y-6">
                {/* Default Category */}
                <div>
                  <label className="field-label">Default Category</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {LINK_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setDefaultCategory(cat.id)}
                        className={`flex items-center justify-between rounded-lg border px-3.5 py-2 text-xs font-medium transition-all ${
                          defaultCategory === cat.id
                            ? 'border-accent-400 bg-accent-400/10 text-accent-400 shadow-sm'
                            : 'border-ink-700 bg-ink-950 text-paper-400 hover:border-ink-600 hover:text-paper-100'
                        }`}
                      >
                        <span>{cat.label}</span>
                        {defaultCategory === cat.id && <Check size={13} className="text-accent-400" />}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-paper-500">
                    New short links will automatically categorize under this tag.
                  </p>
                </div>

                {/* Default Expiration */}
                <div>
                  <label className="field-label" htmlFor="default-expiration">
                    Default Expiration Rule
                  </label>
                  <select
                    id="default-expiration"
                    className="input"
                    value={defaultExpiration}
                    onChange={(e) => setDefaultExpiration(Number(e.target.value))}
                  >
                    {EXPIRATION_PRESETS.map((p) => (
                      <option key={p.days} value={p.days}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Default UTM Parameters */}
                <div className="border-t border-ink-800 pt-5">
                  <h3 className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                    <Globe size={15} className="text-cyan-400" />
                    <span>Default UTM Campaign Parameters</span>
                  </h3>
                  <p className="mt-1 text-xs text-paper-500">
                    Pre-populate marketing tracking parameters on newly generated links.
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="field-label" htmlFor="utm-source">
                        utm_source
                      </label>
                      <input
                        id="utm-source"
                        type="text"
                        className="input"
                        placeholder="e.g. linkly, newsletter"
                        value={defaultUtmSource}
                        onChange={(e) => setDefaultUtmSource(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="utm-medium">
                        utm_medium
                      </label>
                      <input
                        id="utm-medium"
                        type="text"
                        className="input"
                        placeholder="e.g. social, email, cpc"
                        value={defaultUtmMedium}
                        onChange={(e) => setDefaultUtmMedium(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="utm-campaign">
                        utm_campaign
                      </label>
                      <input
                        id="utm-campaign"
                        type="text"
                        className="input"
                        placeholder="e.g. summer_promo, launch"
                        value={defaultUtmCampaign}
                        onChange={(e) => setDefaultUtmCampaign(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" className="btn-primary" disabled={isSavingDefaults}>
                    <Save size={15} />
                    <span>{isSavingDefaults ? 'Saving Defaults...' : 'Save Default Presets'}</span>
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: Security & Sessions */}
        {/* ========================================================================= */}
        {activeTab === 'security' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-4xl"
          >
            {/* Change Password Card */}
            <div className="panel p-6">
              <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
                <Lock size={18} className="text-accent-400" />
                <span>Change Password</span>
              </h2>
              <p className="mt-1 text-xs text-paper-500">
                Update your account password. Requires your existing password for verification.
              </p>

              <form onSubmit={handleChangePassword} className="mt-5 space-y-4 max-w-lg">
                <div>
                  <label className="field-label" htmlFor="current-password">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      id="current-password"
                      type={showCurrentPass ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-3 top-2.5 text-paper-500 hover:text-paper-100"
                    >
                      {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="field-label" htmlFor="new-password">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showNewPass ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="At least 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-2.5 text-paper-500 hover:text-paper-100"
                    >
                      {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Password Strength Indicator */}
                  {newPassword && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-ink-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            newPassword.length < 6
                              ? 'w-1/4 bg-rose-500'
                              : newPassword.length < 10
                              ? 'w-2/3 bg-amber-400'
                              : 'w-full bg-emerald-400'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-paper-400">
                        {newPassword.length < 6
                          ? 'Too short'
                          : newPassword.length < 10
                          ? 'Moderate'
                          : 'Strong'}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="field-label" htmlFor="confirm-password">
                    Confirm New Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="input"
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary mt-2"
                  disabled={isUpdatingPassword}
                >
                  <Lock size={15} />
                  <span>{isUpdatingPassword ? 'Updating...' : 'Update Password'}</span>
                </button>
              </form>
            </div>

            {/* Active Browser Session Card */}
            <div className="panel p-6">
              <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
                <Laptop size={18} className="text-cyan-400" />
                <span>Active Browser Session</span>
              </h2>
              <p className="mt-1 text-xs text-paper-500">
                Details regarding the current browser and device connected to Linkly.
              </p>

              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-ink-700 bg-ink-950 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-accent-400 border border-ink-700">
                    <Laptop size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                      <span>{navigator.userAgent.includes('Mac') ? 'macOS Device' : 'Desktop Device'}</span>
                      <span className="badge text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                        Current Session
                      </span>
                    </div>
                    <div className="text-xs text-paper-500 mt-0.5 truncate max-w-sm sm:max-w-md">
                      {navigator.userAgent}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="btn-secondary btn-sm self-start sm:self-center"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* Two-Factor Authentication Card */}
            <div className="panel p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
                    <Shield size={18} className="text-indigo-400" />
                    <span>Two-Factor Authentication (2FA)</span>
                  </h2>
                  <p className="mt-1 text-xs text-paper-500">
                    Require an authentication code in addition to your password for extra security.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggle2Fa}
                  className={`btn btn-sm ${
                    twoFactorEnabled ? 'btn-secondary text-rose-400' : 'btn-primary'
                  }`}
                >
                  {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: Analytics & Privacy Preferences */}
        {/* ========================================================================= */}
        {activeTab === 'preferences' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-4xl"
          >
            <div className="panel p-6">
              <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
                <BarChart3 size={18} className="text-accent-400" />
                <span>Analytics & Privacy Controls</span>
              </h2>
              <p className="mt-1 text-xs text-paper-500">
                Configure your default chart telemetry timeframe and data privacy settings.
              </p>

              <form onSubmit={handleSavePreferences} className="mt-6 space-y-6">
                {/* Default Time Range */}
                <div>
                  <label className="field-label" htmlFor="analytics-range">
                    Default Analytics Timeframe
                  </label>
                  <select
                    id="analytics-range"
                    className="input"
                    value={analyticsRange}
                    onChange={(e) => setAnalyticsRange(e.target.value)}
                  >
                    {ANALYTICS_RANGES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-paper-500">
                    The initial date filter loaded whenever viewing detailed link analytics.
                  </p>
                </div>

                {/* GDPR IP Anonymization Toggle */}
                <div className="flex items-start justify-between rounded-xl border border-ink-700 bg-ink-950 p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                      <Shield size={16} className="text-emerald-400" />
                      <span>Visitor IP Anonymization (GDPR Compliance)</span>
                    </h3>
                    <p className="mt-1 text-xs text-paper-400 max-w-xl leading-relaxed">
                      Automatically mask the last octet of visitor IP addresses (e.g.{' '}
                      <code className="text-accent-400 font-mono text-[11px]">192.168.1.xxx</code>) before
                      recording click analytics into the database.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnonymizeIps(!anonymizeIps)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      anonymizeIps ? 'bg-accent-400' : 'bg-ink-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-ink-950 transition duration-200 ease-in-out ${
                        anonymizeIps ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Email Notifications Toggle */}
                <div className="flex items-start justify-between rounded-xl border border-ink-700 bg-ink-950 p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                      <Bell size={16} className="text-amber-400" />
                      <span>Click Milestone Email Notifications</span>
                    </h3>
                    <p className="mt-1 text-xs text-paper-400 max-w-xl leading-relaxed">
                      Receive email alerts whenever any of your short links cross high-traffic milestones
                      (1,000, 10,000, and 100,000 clicks).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmailNotifications(!emailNotifications)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      emailNotifications ? 'bg-accent-400' : 'bg-ink-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-ink-950 transition duration-200 ease-in-out ${
                        emailNotifications ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" className="btn-primary" disabled={isSavingPreferences}>
                    <Save size={15} />
                    <span>{isSavingPreferences ? 'Saving...' : 'Save Preferences'}</span>
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: Data Management & Danger Zone */}
        {/* ========================================================================= */}
        {activeTab === 'data' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-4xl"
          >
            {/* Data Export Card */}
            <div className="panel p-6">
              <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
                <Download size={18} className="text-accent-400" />
                <span>Export Personal Data</span>
              </h2>
              <p className="mt-1 text-xs text-paper-500">
                Download your account records, shortened URLs, and click streams for backup or offline analysis.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* JSON Export */}
                <div className="rounded-xl border border-ink-700 bg-ink-950 p-5 flex flex-col justify-between">
                  <div>
                    <div className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                      <Download size={16} className="text-accent-400" />
                      <span>Account Archive (JSON)</span>
                    </div>
                    <p className="mt-1 text-xs text-paper-400 leading-relaxed">
                      Contains your profile settings, all short links with destinations, tags, webhooks, and active API keys.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="btn-secondary btn-sm mt-4 self-start flex items-center gap-1.5"
                    disabled={isExportingJson}
                  >
                    <Download size={13} />
                    <span>{isExportingJson ? 'Preparing...' : 'Download JSON Archive'}</span>
                  </button>
                </div>

                {/* CSV Analytics Export */}
                <div className="rounded-xl border border-ink-700 bg-ink-950 p-5 flex flex-col justify-between">
                  <div>
                    <div className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                      <FileSpreadsheet size={16} className="text-emerald-400" />
                      <span>Raw Click Telemetry (CSV)</span>
                    </div>
                    <p className="mt-1 text-xs text-paper-400 leading-relaxed">
                      Download individual click events including timestamps, referrers, device models, and geo country codes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="btn-secondary btn-sm mt-4 self-start flex items-center gap-1.5"
                    disabled={isExportingCsv}
                  >
                    <FileSpreadsheet size={13} />
                    <span>{isExportingCsv ? 'Exporting...' : 'Download CSV Stream'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6">
              <h2 className="text-base font-semibold text-rose-400 flex items-center gap-2">
                <AlertTriangle size={18} />
                <span>Danger Zone</span>
              </h2>
              <p className="mt-1 text-xs text-paper-400">
                Irreversible actions that affect your entire account and all shortened URLs.
              </p>

              <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-rose-500/20 pt-4">
                <div>
                  <h3 className="text-sm font-semibold text-paper-100">Delete Account & Resources</h3>
                  <p className="mt-0.5 text-xs text-paper-400">
                    Permanently delete your profile and cascade delete all short links, webhooks, and API keys.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="btn bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 text-xs px-4 py-2 self-start sm:self-center"
                  disabled={isDeletingAccount}
                >
                  <Trash2 size={14} className="mr-1" />
                  <span>{isDeletingAccount ? 'Deleting...' : 'Delete Account'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AppShell>
    </>
  );
}
