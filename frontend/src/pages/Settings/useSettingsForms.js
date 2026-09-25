import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { authService, analyticsService } from '../../services';
import { validatePasswordChange, dateStamp, downloadBlob } from './settingsHelpers';

/**
 * One hook per settings tab. They're all called from the Settings page (not
 * from the tabs) so unsaved edits survive switching tabs, and each reloads
 * its fields whenever the user object changes, as the page always has.
 */

export function useProfileForm(user, setUser) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarColor, setAvatarColor] = useState('accent');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setBio(user.bio || '');
      setAvatarColor(user.avatarColor || 'accent');
    }
  }, [user]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await authService.updateProfile({ name: name.trim(), bio: bio.trim(), avatarColor });
      setUser(res.user);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  return { name, setName, bio, setBio, avatarColor, setAvatarColor, isSavingProfile, handleSaveProfile };
}

export function useLinkDefaultsForm(user, setUser) {
  const [defaultCategory, setDefaultCategory] = useState('marketing');
  const [defaultExpiration, setDefaultExpiration] = useState(0);
  const [defaultUtmSource, setDefaultUtmSource] = useState('');
  const [defaultUtmMedium, setDefaultUtmMedium] = useState('');
  const [defaultUtmCampaign, setDefaultUtmCampaign] = useState('');
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);

  useEffect(() => {
    if (user) {
      setDefaultCategory(user.defaultLinkCategory || 'marketing');
      setDefaultExpiration(user.defaultExpirationDays || 0);
      setDefaultUtmSource(user.defaultUtm?.source || '');
      setDefaultUtmMedium(user.defaultUtm?.medium || '');
      setDefaultUtmCampaign(user.defaultUtm?.campaign || '');
    }
  }, [user]);

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

  return {
    defaultCategory,
    setDefaultCategory,
    defaultExpiration,
    setDefaultExpiration,
    defaultUtmSource,
    setDefaultUtmSource,
    defaultUtmMedium,
    setDefaultUtmMedium,
    defaultUtmCampaign,
    setDefaultUtmCampaign,
    isSavingDefaults,
    handleSaveDefaults,
  };
}

export function usePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const error = validatePasswordChange({ currentPassword, newPassword, confirmPassword });
    if (error) return toast.error(error);

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

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    showCurrentPass,
    setShowCurrentPass,
    showNewPass,
    setShowNewPass,
    isUpdatingPassword,
    handleChangePassword,
  };
}

export function usePreferencesForm(user, setUser) {
  const [analyticsRange, setAnalyticsRange] = useState('7d');
  const [anonymizeIps, setAnonymizeIps] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  useEffect(() => {
    if (user) {
      setAnalyticsRange(user.defaultAnalyticsRange || '7d');
      setAnonymizeIps(!!user.anonymizeVisitorIps);
      setEmailNotifications(user.preferences?.emailNotifications ?? true);
    }
  }, [user]);

  const handleSavePreferences = async (e) => {
    e.preventDefault();
    setIsSavingPreferences(true);
    try {
      const res = await authService.updateProfile({
        defaultAnalyticsRange: analyticsRange,
        anonymizeVisitorIps: anonymizeIps,
        preferences: { ...user?.preferences, emailNotifications },
      });
      setUser(res.user);
      toast.success('Preferences updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update preferences');
    } finally {
      setIsSavingPreferences(false);
    }
  };

  return {
    analyticsRange,
    setAnalyticsRange,
    anonymizeIps,
    setAnonymizeIps,
    emailNotifications,
    setEmailNotifications,
    isSavingPreferences,
    handleSavePreferences,
  };
}

export function useAccountData(logout) {
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePasswordText, setShowDeletePasswordText] = useState(false);

  const handleExportJson = async () => {
    setIsExportingJson(true);
    try {
      const data = await authService.exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `linkora-account-export-${dateStamp()}.json`);
      toast.success('Account JSON archive exported');
    } catch {
      toast.error('Failed to export account data');
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    try {
      const blobData = await analyticsService.exportAnalytics();
      downloadBlob(new Blob([blobData]), `linkora-clicks-stream-${dateStamp()}.csv`);
      toast.success('Analytics CSV export downloaded');
    } catch {
      toast.error('Failed to export analytics CSV');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const openDeleteModal = () => {
    setDeletePassword('');
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    if (!isDeletingAccount) setShowDeleteModal(false);
  };

  const handleConfirmDeleteAccount = async (e) => {
    e?.preventDefault();
    if (!deletePassword) {
      toast.error('Password is required to delete account');
      return;
    }
    setIsDeletingAccount(true);
    try {
      await authService.deleteAccount(deletePassword);
      toast.success('Account deleted successfully');
      setShowDeleteModal(false);
      logout();
      window.location.href = '/register';
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete account');
      setIsDeletingAccount(false);
    }
  };

  return {
    isExportingJson,
    isExportingCsv,
    isDeletingAccount,
    showDeleteModal,
    setShowDeleteModal,
    deletePassword,
    setDeletePassword,
    showDeletePasswordText,
    setShowDeletePasswordText,
    handleExportJson,
    handleExportCsv,
    openDeleteModal,
    closeDeleteModal,
    handleConfirmDeleteAccount,
  };
}
