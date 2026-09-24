import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';

export const CATEGORIES = [
  { id: 'marketing', label: 'Marketing' },
  { id: 'sales', label: 'Sales' },
  { id: 'product', label: 'Product' },
  { id: 'social', label: 'Social' },
  { id: 'personal', label: 'Personal' },
  { id: 'other', label: 'Other' },
];

export const UTM_PRESETS = [
  { name: 'Google Ads', source: 'google', medium: 'cpc' },
  { name: 'Twitter / X', source: 'twitter', medium: 'social' },
  { name: 'LinkedIn', source: 'linkedin', medium: 'social' },
  { name: 'Email Newsletter', source: 'newsletter', medium: 'email' },
  { name: 'Facebook Ad', source: 'facebook', medium: 'paid-social' },
];

export const EXPIRY_PRESETS = [
  { label: '24h', hours: 24 },
  { label: '7 Days', hours: 24 * 7 },
  { label: '30 Days', hours: 24 * 30 },
  { label: 'Never', hours: 0 },
];

export const EMPTY_FORM = {
  originalUrl: '',
  customAlias: '',
  title: '',
  description: '',
  category: 'marketing',
  password: '',
  enablePassword: false,
  enableMaxClicks: false,
  maxClicks: '',
  expiryOption: 'Never',
  customExpiryDate: '',
  expiredRedirectUrl: '',
  iosRedirect: '',
  androidRedirect: '',
  qrConfig: DEFAULT_QR_CONFIG,
  tags: [],
  tagInput: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  utmTerm: '',
  utmContent: '',
  routingType: 'direct', // 'direct' | 'ab_test'
  variants: [
    { id: 'var_a', name: 'Variant A (Control)', url: '', weight: 50 },
    { id: 'var_b', name: 'Variant B (Challenger)', url: '', weight: 50 },
  ],
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
};
