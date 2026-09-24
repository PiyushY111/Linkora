import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { linkService } from '../../../services';

/**
 * Edit-mode state for LinkDrawer: one field per editable setting, reset
 * from `link` whenever a different link is shown, and the save handler
 * that sends only what changed (with remove* flags for cleared settings).
 * @param {{ link: object | null, updateLink: (link: object) => void, setIsUpdating: (v: boolean) => void }} deps
 */
export default function useLinkEditor({ link, updateLink, setIsUpdating }) {
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

  return {
    isEditing, setIsEditing,
    originalUrl, setOriginalUrl,
    title, setTitle,
    description, setDescription,
    category, setCategory,
    tags, tagInput, setTagInput, handleAddTag, handleRemoveTag,
    newPassword, setNewPassword, showPassword, setShowPassword, removePassword, setRemovePassword,
    maxClicks, setMaxClicks, enableMaxClicks, setEnableMaxClicks, removeMaxClicks, setRemoveMaxClicks,
    expiryDate, setExpiryDate, removeExpiryDate, setRemoveExpiryDate,
    expiredRedirectUrl, setExpiredRedirectUrl,
    iosRedirect, setIosRedirect, androidRedirect, setAndroidRedirect,
    utmSource, setUtmSource, utmMedium, setUtmMedium, utmCampaign, setUtmCampaign,
    handleSaveEdit,
  };
}
