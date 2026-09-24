import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';
import { EXPIRY_PRESETS } from './constants';

function expiryDateFor(formData) {
  if (formData.expiryOption === 'Custom' && formData.customExpiryDate) {
    return new Date(formData.customExpiryDate).toISOString();
  }
  const foundPreset = EXPIRY_PRESETS.find((p) => p.label === formData.expiryOption);
  if (foundPreset && foundPreset.hours > 0) {
    const d = new Date();
    d.setHours(d.getHours() + foundPreset.hours);
    return d.toISOString();
  }
  return null;
}

/**
 * Turns the create-link form into the POST /api/links body. Optional fields
 * are included only when set. Returns `{ error }` for an A/B test whose
 * variants don't add up to 100% or lack a URL.
 * @param {object} formData
 * @param {string} destinationUrl - the destination with UTM parameters applied
 * @param {string | null} styledQrDataUrl - the live QR preview, if captured
 * @returns {{ payload: object } | { error: string }}
 */
export default function buildLinkPayload(formData, destinationUrl, styledQrDataUrl) {
  const finalUrl = destinationUrl || formData.originalUrl.trim();
  const expiryDate = expiryDateFor(formData);

  const payload = {
    originalUrl: finalUrl,
    category: formData.category,
    tags: formData.tags,
    qrConfig: formData.qrConfig || DEFAULT_QR_CONFIG,
    ...(styledQrDataUrl ? { qrCode: styledQrDataUrl } : {}),
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
      return { error: `Variant weights must sum to exactly 100% (currently ${totalWeight}%)` };
    }
    for (const v of formData.variants) {
      if (!v.url || !v.url.trim()) {
        return { error: `Please provide a destination URL for ${v.name}` };
      }
    }
    payload.routingType = 'ab_test';
    payload.variants = formData.variants;
  }

  if (formData.ogTitle?.trim()) payload.ogTitle = formData.ogTitle.trim();
  if (formData.ogDescription?.trim()) payload.ogDescription = formData.ogDescription.trim();
  if (formData.ogImage?.trim()) payload.ogImage = formData.ogImage.trim();

  return { payload };
}
