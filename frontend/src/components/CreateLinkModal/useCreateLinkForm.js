import { useState, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';
import { linkService } from '../../services';
import useLinkStore from '../../context/linkStore';
import useAuthStore from '../../context/authStore';
import { EMPTY_FORM } from './constants';
import {
  generateRandomAlias,
  extractDomain,
  buildDestinationUrl,
  computeExpiryDate,
  validateVariants,
  updateVariantAt,
  addTagFromInput,
  buildCreateLinkPayload,
} from './createLinkHelpers';

/**
 * State and actions for the create-link modal. The form lives here (not in
 * the tab components) so switching tabs never loses what was typed.
 */
export default function useCreateLinkForm({ open, onClose }) {
  const { addLink } = useLinkStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'utm' | 'enterprise'
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [createdResult, setCreatedResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const qrViewerRef = useRef(null);
  const successQrViewerRef = useRef(null);

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

  const domain = useMemo(() => extractDomain(formData.originalUrl), [formData.originalUrl]);

  const computedDestinationUrl = useMemo(
    () => buildDestinationUrl(formData),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the URL and UTM fields feed it
    [
      formData.originalUrl,
      formData.utmSource,
      formData.utmMedium,
      formData.utmCampaign,
      formData.utmTerm,
      formData.utmContent,
    ]
  );

  const setField = (name, value) => setFormData((prev) => ({ ...prev, [name]: value }));
  const updateForm = (changes) => setFormData((prev) => ({ ...prev, ...changes }));

  const actions = {
    setField,
    updateForm,
    randomAlias: () => setField('customAlias', generateRandomAlias()),
    handleAddTag: (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        setFormData((prev) => addTagFromInput(prev));
      }
    },
    removeTag: (tagToRemove) =>
      setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tagToRemove) })),
    applyUtmPreset: (preset) => updateForm({ utmSource: preset.source, utmMedium: preset.medium }),
    togglePassword: () =>
      setFormData((prev) => ({
        ...prev,
        enablePassword: !prev.enablePassword,
        password: prev.enablePassword ? '' : prev.password,
      })),
    toggleMaxClicks: () =>
      setFormData((prev) => ({
        ...prev,
        enableMaxClicks: !prev.enableMaxClicks,
        maxClicks: prev.enableMaxClicks ? '' : prev.maxClicks || '25',
      })),
    toggleRouting: () =>
      setFormData((prev) => ({ ...prev, routingType: prev.routingType === 'ab_test' ? 'direct' : 'ab_test' })),
    updateVariant: (index, name, value) =>
      setFormData((prev) => ({ ...prev, variants: updateVariantAt(prev.variants, index, name, value) })),
    removeVariant: (index) =>
      setFormData((prev) => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) })),
    addVariant: () =>
      setFormData((prev) => {
        const char = String.fromCharCode(65 + prev.variants.length);
        return {
          ...prev,
          variants: [
            ...prev.variants,
            { id: `var_${char.toLowerCase()}_${Date.now()}`, name: `Variant ${char}`, url: '', weight: 20 },
          ],
        };
      }),
    applyQrPreset: (preset) =>
      setFormData((prev) => ({
        ...prev,
        qrConfig: { ...(prev.qrConfig || DEFAULT_QR_CONFIG), ...preset.config },
      })),
    changeQrConfig: (updater) =>
      setFormData((prev) => ({
        ...prev,
        qrConfig: typeof updater === 'function' ? updater(prev.qrConfig || DEFAULT_QR_CONFIG) : updater,
      })),
    resetQrConfig: () => setField('qrConfig', DEFAULT_QR_CONFIG),
  };

  const startOver = () => {
    setFormData(EMPTY_FORM);
    setCreatedResult(null);
    setActiveTab('general');
  };

  const handleClose = () => {
    startOver();
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
      const expiryDate = computeExpiryDate(formData);

      // If live preview is active, capture styled dataUrl for backend storage
      let qrCode = null;
      if (qrViewerRef.current) {
        try {
          qrCode = await qrViewerRef.current.getDataUrl(512);
        } catch {}
      }

      if (formData.routingType === 'ab_test') {
        const variantError = validateVariants(formData.variants);
        if (variantError) {
          toast.error(variantError);
          setIsLoading(false);
          return;
        }
      }

      const payload = buildCreateLinkPayload(formData, {
        destinationUrl: computedDestinationUrl,
        qrCode,
        expiryDate,
      });
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

  const downloadQr = async (format = 'png') => {
    if (successQrViewerRef.current) {
      await successQrViewerRef.current.download(`${createdResult?.shortCode || 'link'}-qr`, format, 1024);
      return;
    }
    if (!createdResult?.qrCode) return;
    const a = document.createElement('a');
    a.href = createdResult.qrCode;
    a.download = `${createdResult.shortCode}-qr.${format}`;
    a.click();
  };

  return {
    activeTab,
    setActiveTab,
    formData,
    domain,
    computedDestinationUrl,
    showPassword,
    setShowPassword,
    isLoading,
    createdResult,
    setCreatedResult,
    copied,
    qrViewerRef,
    successQrViewerRef,
    actions,
    startOver,
    handleClose,
    handleSubmit,
    copyShortUrl,
    downloadQr,
  };
}
