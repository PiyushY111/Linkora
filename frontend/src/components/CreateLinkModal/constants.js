import { Sparkles, Sliders, ShieldCheck, Smartphone, Split, Share2, QrCode } from 'lucide-react';
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

export const MAX_CLICK_PRESETS = [5, 25, 100, 500];

export const MAX_VARIANTS = 4;

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

/**
 * Tab bar entries, in display order. `hasValues` lights the dot next to a
 * tab's label; `footerLabel` is what the footer shows while it's active.
 */
export const TABS = [
  { id: 'general', label: 'General Details', footerLabel: 'General', icon: Sparkles },
  {
    id: 'utm',
    label: 'UTM Studio',
    footerLabel: 'Attribution',
    icon: Sliders,
    hasValues: (f) => Boolean(f.utmSource || f.utmMedium || f.utmCampaign),
  },
  {
    id: 'enterprise',
    label: 'Security & Access',
    footerLabel: 'Security & Access',
    icon: ShieldCheck,
    hasValues: (f) =>
      Boolean(f.enablePassword || f.expiryOption !== 'Never' || f.enableMaxClicks || f.expiredRedirectUrl),
  },
  {
    id: 'targeting',
    label: 'Device Targeting',
    footerLabel: 'Device Targeting',
    icon: Smartphone,
    hasValues: (f) => Boolean(f.iosRedirect || f.androidRedirect),
  },
  {
    id: 'ab_test',
    label: 'A/B Split',
    footerLabel: 'A/B Split',
    icon: Split,
    hasValues: (f) => f.routingType === 'ab_test',
  },
  {
    id: 'opengraph',
    label: 'Social Preview',
    footerLabel: 'Social Preview',
    icon: Share2,
    hasValues: (f) => Boolean(f.ogTitle || f.ogImage),
  },
  { id: 'qr', label: 'Custom QR', footerLabel: 'Custom QR', icon: QrCode },
];
