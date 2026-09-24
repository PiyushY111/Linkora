import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authService } from '../../../services';

/** Default analytics range and privacy settings, hydrated from `user`. */
export default function usePreferencesForm(user, setUser) {
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

  return { analyticsRange, setAnalyticsRange, anonymizeIps, setAnonymizeIps, isSavingPreferences, handleSavePreferences };
}
