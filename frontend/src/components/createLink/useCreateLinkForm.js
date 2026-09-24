import { useMemo, useState } from 'react';
import { EMPTY_FORM } from './constants';

/**
 * Form state for CreateLinkModal and the values derived from it: the
 * destination's domain (for the favicon and card previews) and the final
 * destination URL with UTM parameters applied.
 */
export default function useCreateLinkForm() {
  const [formData, setFormData] = useState(EMPTY_FORM);

  const generateRandomAlias = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, customAlias: code }));
  };

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

  return {
    formData,
    setFormData,
    domain,
    computedDestinationUrl,
    generateRandomAlias,
    handleAddTag,
    removeTag,
    applyUtmPreset,
  };
}
