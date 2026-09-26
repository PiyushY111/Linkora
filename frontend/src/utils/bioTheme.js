import { QR_BRAND_ICONS, QR_DESIGNER_PRESETS } from './qrPresets';
import { getHostedOrigin } from './domain';

// Mirrors the backend's defaults (models/BioPage.js).
export const DEFAULT_BIO_THEME = Object.freeze({ primaryColor: '#C6FF3D', bgColor: '#0A0A0B', font: 'sans' });

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FONT_CLASSES = { sans: 'font-sans', mono: 'font-mono' };

export const BIO_THEME_FONTS = [
  { id: 'sans', label: 'Inter' },
  { id: 'mono', label: 'JetBrains Mono' },
];

// The QR studio's curated palettes, as bio themes: one set of brand themes
// across both tools.
export const BIO_THEME_PRESETS = QR_DESIGNER_PRESETS.map(({ id, name, config }) => ({
  id,
  name,
  primaryColor: config.dotsColor,
  bgColor: config.bgColor,
}));

export function isHexColor(value) {
  return HEX_COLOR_PATTERN.test(value ?? '');
}

/**
 * The page's theme with any missing or malformed token replaced by the
 * default, so a bad value can't reach an inline style.
 * @param {{ primaryColor?: string, bgColor?: string, font?: string } | undefined} theme
 */
export function resolveBioTheme(theme = {}) {
  return {
    primaryColor: isHexColor(theme.primaryColor) ? theme.primaryColor : DEFAULT_BIO_THEME.primaryColor,
    bgColor: isHexColor(theme.bgColor) ? theme.bgColor : DEFAULT_BIO_THEME.bgColor,
    font: FONT_CLASSES[theme.font] ? theme.font : DEFAULT_BIO_THEME.font,
  };
}

/** @param {'sans' | 'mono'} font */
export function fontClass(font) {
  return FONT_CLASSES[font] ?? FONT_CLASSES.sans;
}

// WCAG relative luminance of a #rrggbb color, 0 (black) to 1 (white).
function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Near-black or near-white, whichever contrasts more with `hex`, for text
 * drawn on a user-chosen color.
 * @param {string} hex - #rrggbb
 */
export function readableTextColor(hex) {
  const luminance = relativeLuminance(hex);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithBlack >= contrastWithWhite ? '#0A0A0B' : '#F5F5F7';
}

/** The QR studio brand icon for an item's icon id, if there is one. */
export function findBioIcon(iconId) {
  return iconId ? QR_BRAND_ICONS.find((icon) => icon.id === iconId) ?? null : null;
}

/** The public address of a bio page. */
export function publicBioUrl(slug) {
  return `${getHostedOrigin()}/b/${slug}`;
}

/**
 * The builder's items as the public page will list them: the same rule as
 * the server (only active items whose link is still active), shaped for
 * BioPageView.
 * @param {{ _id: string, label: string, icon?: string, active: boolean, link: { shortUrl: string, isActive: boolean } | null }[]} items
 */
export function toVisibleBioItems(items = []) {
  return items
    .filter((item) => item.active && item.link?.isActive)
    .map((item) => ({ id: item._id, label: item.label, icon: item.icon || null, shortUrl: item.link.shortUrl }));
}
