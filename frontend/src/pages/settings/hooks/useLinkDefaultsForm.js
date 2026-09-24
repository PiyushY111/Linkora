import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authService } from '../../../services';

/** Default category, expiry and UTM parameters for new links, hydrated from `user`. */
export default function useLinkDefaultsForm(user, setUser) {
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
    defaultCategory, setDefaultCategory,
    defaultExpiration, setDefaultExpiration,
    defaultUtmSource, setDefaultUtmSource,
    defaultUtmMedium, setDefaultUtmMedium,
    defaultUtmCampaign, setDefaultUtmCampaign,
    isSavingDefaults, handleSaveDefaults,
  };
}
