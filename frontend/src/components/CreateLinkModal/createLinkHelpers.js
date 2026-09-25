import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';
import { EXPIRY_PRESETS } from './constants';

const ALIAS_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const ALIAS_LENGTH = 6;

/** Random 6-character alias from an unambiguous alphabet (no 0/o, 1/l/i). */
export function generateRandomAlias(random = Math.random) {
  let code = '';
  for (let i = 0; i < ALIAS_LENGTH; i++) {
    code += ALIAS_CHARS.charAt(Math.floor(random() * ALIAS_CHARS.length));
  }
  return code;
}

function withProtocol(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Hostname of the destination (for the favicon preview), or null. */
export function extractDomain(originalUrl) {
  try {
    if (!originalUrl) return null;
    return new URL(withProtocol(originalUrl.trim())).hostname;
  } catch {
    return null;
  }
}

const UTM_FIELDS = [
  ['utmSource', 'utm_source'],
  ['utmMedium', 'utm_medium'],
  ['utmCampaign', 'utm_campaign'],
  ['utmTerm', 'utm_term'],
  ['utmContent', 'utm_content'],
];

/**
 * The destination URL with the form's UTM parameters applied. Returns '' for
 * an empty destination and the raw input if it can't be parsed as a URL.
 */
export function buildDestinationUrl(form) {
  if (!form.originalUrl.trim()) return '';
  try {
    const url = new URL(withProtocol(form.originalUrl.trim()));
    for (const [field, param] of UTM_FIELDS) {
      if (form[field].trim()) url.searchParams.set(param, form[field].trim());
    }
    return url.toString();
  } catch {
    return form.originalUrl;
  }
}

/** ISO expiry for the selected option, or null for "Never" / no custom date. */
export function computeExpiryDate(form, now = new Date()) {
  if (form.expiryOption === 'Custom' && form.customExpiryDate) {
    return new Date(form.customExpiryDate).toISOString();
  }
  const preset = EXPIRY_PRESETS.find((p) => p.label === form.expiryOption);
  if (!preset || preset.hours <= 0) return null;
  const d = new Date(now);
  d.setHours(d.getHours() + preset.hours);
  return d.toISOString();
}

export function totalVariantWeight(variants) {
  return variants.reduce((acc, v) => acc + (Number(v.weight) || 0), 0);
}

/** The toast message for an invalid A/B setup, or null if it's valid. */
export function validateVariants(variants) {
  const totalWeight = totalVariantWeight(variants);
  if (totalWeight !== 100) {
    return `Variant weights must sum to exactly 100% (currently ${totalWeight}%)`;
  }
  const missingUrl = variants.find((v) => !v.url || !v.url.trim());
  return missingUrl ? `Please provide a destination URL for ${missingUrl.name}` : null;
}

/**
 * A copy of `variants` with one field of one variant changed. The variant is
 * copied too: the defaults in EMPTY_FORM share these objects, so editing one
 * in place would leak into the next "Create link".
 */
export function updateVariantAt(variants, index, name, value) {
  return variants.map((v, i) => (i === index ? { ...v, [name]: value } : v));
}

/** Adds a tag typed into the tag input; returns the form unchanged if there's nothing new to add. */
export function addTagFromInput(form) {
  const val = form.tagInput.trim().replace(/^,+|,+$/g, '');
  if (!val || form.tags.includes(val)) return form;
  return { ...form, tags: [...form.tags, val], tagInput: '' };
}

/**
 * The POST /links body. Empty optional fields are left out; `variants` must
 * already be validated when routingType is 'ab_test'.
 * @param {typeof import('./constants').EMPTY_FORM} form
 * @param {{ destinationUrl: string, qrCode?: string | null, expiryDate: string | null }} extras
 */
export function buildCreateLinkPayload(form, { destinationUrl, qrCode, expiryDate }) {
  const payload = {
    originalUrl: destinationUrl || form.originalUrl.trim(),
    category: form.category,
    tags: form.tags,
    qrConfig: form.qrConfig || DEFAULT_QR_CONFIG,
    ...(qrCode ? { qrCode } : {}),
  };

  if (form.customAlias.trim()) payload.customAlias = form.customAlias.trim();
  if (form.title.trim()) payload.title = form.title.trim();
  if (form.description.trim()) payload.description = form.description.trim();
  if (form.enablePassword && form.password.trim()) payload.password = form.password.trim();
  if (form.enableMaxClicks && Number(form.maxClicks) > 0) {
    payload.maxClicks = parseInt(form.maxClicks, 10);
  }
  if (expiryDate) payload.expiryDate = expiryDate;
  if (form.expiredRedirectUrl.trim()) payload.expiredRedirectUrl = form.expiredRedirectUrl.trim();
  if (form.iosRedirect.trim()) payload.iosRedirect = form.iosRedirect.trim();
  if (form.androidRedirect.trim()) payload.androidRedirect = form.androidRedirect.trim();
  if (UTM_FIELDS.some(([field]) => form[field].trim())) {
    payload.utm = {
      source: form.utmSource.trim(),
      medium: form.utmMedium.trim(),
      campaign: form.utmCampaign.trim(),
      term: form.utmTerm.trim(),
      content: form.utmContent.trim(),
    };
  }
  if (form.routingType === 'ab_test') {
    payload.routingType = 'ab_test';
    payload.variants = form.variants;
  }
  if (form.ogTitle?.trim()) payload.ogTitle = form.ogTitle.trim();
  if (form.ogDescription?.trim()) payload.ogDescription = form.ogDescription.trim();
  if (form.ogImage?.trim()) payload.ogImage = form.ogImage.trim();

  return payload;
}
