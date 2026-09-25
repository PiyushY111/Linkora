export const CATEGORIES = ['marketing', 'sales', 'product', 'social', 'personal', 'other'];

export const MAX_CLICK_PRESETS = [5, 25, 100, 500];

export const EXPIRY_PRESETS = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
];

const QUOTA_WARNING_RATIO = 0.8;

/** Edit-form values before a link has loaded. */
export const EMPTY_EDIT_FORM = {
  originalUrl: '',
  title: '',
  description: '',
  category: 'marketing',
  tags: [],
  newPassword: '',
  removePassword: false,
  maxClicks: '',
  enableMaxClicks: false,
  removeMaxClicks: false,
  expiryDate: '',
  removeExpiryDate: false,
  expiredRedirectUrl: '',
  iosRedirect: '',
  androidRedirect: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
};

/** The value a datetime-local input shows for a date (UTC, minute precision). */
export function toDateTimeLocal(date) {
  return new Date(date).toISOString().slice(0, 16);
}

/** datetime-local value `hours` from now. */
export function presetExpiry(hours, now = new Date()) {
  const d = new Date(now);
  d.setHours(d.getHours() + hours);
  return toDateTimeLocal(d);
}

/** Edit-form values for a link. */
export function formFromLink(link) {
  return {
    originalUrl: link.originalUrl || '',
    title: link.title || '',
    description: link.description || '',
    category: link.category || 'other',
    tags: link.tags || [],
    newPassword: '',
    removePassword: false,
    maxClicks: link.maxClicks ? String(link.maxClicks) : '',
    enableMaxClicks: Boolean(link.maxClicks),
    removeMaxClicks: false,
    expiryDate: link.expiryDate ? toDateTimeLocal(link.expiryDate) : '',
    removeExpiryDate: false,
    expiredRedirectUrl: link.expiredRedirectUrl || '',
    iosRedirect: link.iosRedirect || '',
    androidRedirect: link.androidRedirect || '',
    utmSource: link.utm?.source || '',
    utmMedium: link.utm?.medium || '',
    utmCampaign: link.utm?.campaign || '',
  };
}

/**
 * Whether the link has a click cap. A real boolean on purpose: `maxClicks`
 * can be 0, and `{link.maxClicks && <X />}` would render a literal "0".
 */
export function hasClickLimit(link) {
  return Number(link.maxClicks) > 0;
}

export function isQuotaFull(link) {
  return Boolean(link.maxClicks && (link.clicks || 0) >= link.maxClicks);
}

export function isLinkExpired(link, now = new Date()) {
  return Boolean(link.expiryDate && new Date(link.expiryDate) < now);
}

/** Which header badge a link gets: flagged > limit > expired > active > paused. */
export function getLinkStatus(link, now = new Date()) {
  if (link.abuseFlag) return 'flagged';
  if (isQuotaFull(link)) return 'limit';
  if (isLinkExpired(link, now)) return 'expired';
  return link.isActive ? 'active' : 'paused';
}

/** Click-quota bar values; only meaningful when link.maxClicks > 0. */
export function getQuotaProgress(link) {
  const clicks = link.clicks || 0;
  const isFull = clicks >= link.maxClicks;
  let barClass = 'bg-accent-400';
  if (isFull) barClass = 'bg-danger';
  else if (clicks / link.maxClicks >= QUOTA_WARNING_RATIO) barClass = 'bg-warning';
  return {
    percent: Math.min(100, Math.round((clicks / link.maxClicks) * 100)),
    remaining: Math.max(0, link.maxClicks - clicks),
    isFull,
    barClass,
  };
}

/**
 * The PATCH body for the drawer's edit form. Fields that were cleared on a
 * link that had them are sent as explicit remove* flags.
 */
export function buildLinkUpdatePayload(link, form) {
  const payload = {
    title: form.title,
    description: form.description,
    category: form.category,
    tags: form.tags,
  };

  if (form.originalUrl.trim() && form.originalUrl.trim() !== link.originalUrl) {
    payload.originalUrl = form.originalUrl.trim();
  }

  if (form.removePassword) {
    payload.removePassword = true;
  } else if (form.newPassword.trim()) {
    payload.password = form.newPassword.trim();
  }

  if (form.removeMaxClicks || (!form.enableMaxClicks && link.maxClicks)) {
    payload.removeMaxClicks = true;
  } else if (form.enableMaxClicks && Number(form.maxClicks) > 0) {
    payload.maxClicks = parseInt(form.maxClicks, 10);
  }

  if (form.removeExpiryDate) {
    payload.removeExpiryDate = true;
  } else if (form.expiryDate) {
    payload.expiryDate = new Date(form.expiryDate).toISOString();
  }

  const optionalUrls = [
    ['expiredRedirectUrl', 'removeExpiredRedirectUrl'],
    ['iosRedirect', 'removeIosRedirect'],
    ['androidRedirect', 'removeAndroidRedirect'],
  ];
  for (const [field, removeFlag] of optionalUrls) {
    if (form[field].trim()) {
      payload[field] = form[field].trim();
    } else if (link[field]) {
      payload[removeFlag] = true;
    }
  }

  if (form.utmSource.trim() || form.utmMedium.trim() || form.utmCampaign.trim()) {
    payload.utm = {
      source: form.utmSource.trim(),
      medium: form.utmMedium.trim(),
      campaign: form.utmCampaign.trim(),
    };
  }

  return payload;
}
