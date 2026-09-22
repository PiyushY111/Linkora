/**
 * Designer Presets & Content Formatters for Linkora QR Engine
 */

export const QR_DOT_TYPES = [
  { id: 'rounded', label: 'Rounded', desc: 'Soft modern pebbles' },
  { id: 'dots', label: 'Dots', desc: 'Circular micro-dots' },
  { id: 'classy', label: 'Classy', desc: 'Elegant cut geometry' },
  { id: 'classy-rounded', label: 'Classy Smooth', desc: 'Curved elegant edges' },
  { id: 'square', label: 'Square', desc: 'Sharp industrial grid' },
  { id: 'extra-rounded', label: 'Extra Smooth', desc: 'Pill-shaped blocks' },
];

export const QR_CORNER_SQUARE_TYPES = [
  { id: 'extra-rounded', label: 'Smooth' },
  { id: 'square', label: 'Square' },
  { id: 'dot', label: 'Circle' },
];

export const QR_CORNER_DOT_TYPES = [
  { id: 'dot', label: 'Dot' },
  { id: 'square', label: 'Square' },
];

export const QR_FRAME_STYLES = [
  { id: 'none', label: 'No Frame', preview: 'Simple clean QR' },
  { id: 'bottom-pill', label: 'Bottom Pill', preview: 'Sleek callout pill badge' },
  { id: 'top-header', label: 'Top Header', preview: 'Modern upper banner' },
  { id: 'card', label: 'Poster Card', preview: 'Full bordered presentation card' },
  { id: 'cyber', label: 'Cyber Neon', preview: 'Glow border hacker frame' },
];

export const QR_BRAND_ICONS = [
  {
    id: 'linkora',
    name: 'Linkora',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="%230A0A0B"/><path d="M12 28L28 12M28 12H16M28 12V24" stroke="%23C6FF3D" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  {
    id: 'globe',
    name: 'Website',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23C6FF3D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  },
  {
    id: 'github',
    name: 'GitHub',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23F5F5F7"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>',
  },
  {
    id: 'twitter',
    name: 'X',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23F5F5F7"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%230A66C2"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  },
];

export const QR_DESIGNER_PRESETS = [
  {
    id: 'cyber-lime',
    name: 'Cyber Lime',
    tag: 'Signature',
    config: {
      dotsType: 'rounded',
      dotsColor: '#C6FF3D',
      bgColor: '#0A0A0B',
      isTransparent: false,
      cornersSquareType: 'extra-rounded',
      cornersSquareColor: '#C6FF3D',
      cornersDotType: 'dot',
      cornersDotColor: '#C6FF3D',
      gradient: {
        enabled: false,
        type: 'linear',
        color1: '#C6FF3D',
        color2: '#06B6D4',
        rotation: 45,
      },
      frame: {
        type: 'bottom-pill',
        text: 'SCAN ME',
        subtext: '',
        color: '#C6FF3D',
        textColor: '#0A0A0B',
      },
    },
  },
  {
    id: 'electric-gradient',
    name: 'Electric Cyan',
    tag: 'Gradient',
    config: {
      dotsType: 'classy',
      dotsColor: '#06B6D4',
      bgColor: '#0A0A0B',
      isTransparent: false,
      cornersSquareType: 'extra-rounded',
      cornersSquareColor: '#6366F1',
      cornersDotType: 'dot',
      cornersDotColor: '#06B6D4',
      gradient: {
        enabled: true,
        type: 'linear',
        color1: '#06B6D4',
        color2: '#6366F1',
        rotation: 45,
      },
      frame: {
        type: 'none',
        text: 'SCAN ME',
        color: '#06B6D4',
        textColor: '#0A0A0B',
      },
    },
  },
  {
    id: 'sunset-neon',
    name: 'Sunset Neon',
    tag: 'Vibrant',
    config: {
      dotsType: 'dots',
      dotsColor: '#FF5C5C',
      bgColor: '#0E0D12',
      isTransparent: false,
      cornersSquareType: 'extra-rounded',
      cornersSquareColor: '#F59E0B',
      cornersDotType: 'dot',
      cornersDotColor: '#FF5C5C',
      gradient: {
        enabled: true,
        type: 'linear',
        color1: '#FF5C5C',
        color2: '#F59E0B',
        rotation: 135,
      },
      frame: {
        type: 'top-header',
        text: 'EXPLORE NOW',
        color: '#FF5C5C',
        textColor: '#FFFFFF',
      },
    },
  },
  {
    id: 'emerald-matrix',
    name: 'Emerald Matrix',
    tag: 'Tech',
    config: {
      dotsType: 'classy-rounded',
      dotsColor: '#10B981',
      bgColor: '#061410',
      isTransparent: false,
      cornersSquareType: 'extra-rounded',
      cornersSquareColor: '#10B981',
      cornersDotType: 'dot',
      cornersDotColor: '#34D399',
      gradient: {
        enabled: true,
        type: 'linear',
        color1: '#10B981',
        color2: '#34D399',
        rotation: 90,
      },
      frame: {
        type: 'cyber',
        text: 'VERIFIED LINK',
        color: '#10B981',
        textColor: '#061410',
      },
    },
  },
  {
    id: 'midnight-violet',
    name: 'Midnight Violet',
    tag: 'Cosmic',
    config: {
      dotsType: 'extra-rounded',
      dotsColor: '#A855F7',
      bgColor: '#0B0813',
      isTransparent: false,
      cornersSquareType: 'extra-rounded',
      cornersSquareColor: '#EC4899',
      cornersDotType: 'dot',
      cornersDotColor: '#A855F7',
      gradient: {
        enabled: true,
        type: 'linear',
        color1: '#A855F7',
        color2: '#EC4899',
        rotation: 60,
      },
      frame: {
        type: 'bottom-pill',
        text: 'TAP OR SCAN',
        color: '#A855F7',
        textColor: '#FFFFFF',
      },
    },
  },
  {
    id: 'monochrome-luxury',
    name: 'Monochrome Dark',
    tag: 'Minimal',
    config: {
      dotsType: 'rounded',
      dotsColor: '#FFFFFF',
      bgColor: '#121215',
      isTransparent: false,
      cornersSquareType: 'square',
      cornersSquareColor: '#FFFFFF',
      cornersDotType: 'square',
      cornersDotColor: '#FFFFFF',
      gradient: { enabled: false },
      frame: {
        type: 'card',
        text: 'LINKORA ASSET',
        subtext: 'Scan with any smartphone camera',
        color: '#FFFFFF',
        textColor: '#0A0A0B',
      },
    },
  },
  {
    id: 'classic-print',
    name: 'Print Ready (Light)',
    tag: 'Paper',
    config: {
      dotsType: 'square',
      dotsColor: '#000000',
      bgColor: '#FFFFFF',
      isTransparent: false,
      cornersSquareType: 'square',
      cornersSquareColor: '#000000',
      cornersDotType: 'square',
      cornersDotColor: '#000000',
      gradient: { enabled: false },
      frame: {
        type: 'bottom-pill',
        text: 'SCAN ME',
        color: '#000000',
        textColor: '#FFFFFF',
      },
    },
  },
];

export const DEFAULT_QR_CONFIG = {
  dotsType: 'rounded',
  dotsColor: '#C6FF3D',
  bgColor: '#0A0A0B',
  isTransparent: false,
  cornersSquareType: 'extra-rounded',
  cornersSquareColor: '#C6FF3D',
  cornersDotType: 'dot',
  cornersDotColor: '#C6FF3D',
  gradient: {
    enabled: false,
    type: 'linear',
    color1: '#C6FF3D',
    color2: '#06B6D4',
    rotation: 45,
  },
  logo: null,
  logoSize: 0.35,
  logoMargin: 6,
  frame: {
    type: 'bottom-pill',
    text: 'SCAN ME',
    subtext: '',
    color: '#C6FF3D',
    textColor: '#0A0A0B',
  },
};

/**
 * Data Formatters for QR Code Content Types
 */
export const formatQrData = {
  url: (val) => {
    if (!val) return '';
    const trimmed = val.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  },

  text: (val) => val || '',

  wifi: ({ ssid = '', password = '', encryption = 'WPA', hidden = false }) => {
    const esc = (s) => (s || '').replace(/([\\;,:"])/g, '\\$1');
    const enc = encryption === 'none' ? 'nopass' : encryption;
    return `WIFI:S:${esc(ssid)};T:${enc};P:${esc(password)};H:${hidden ? 'true' : 'false'};;`;
  },

  vcard: ({
    firstName = '',
    lastName = '',
    phone = '',
    email = '',
    company = '',
    jobTitle = '',
    url = '',
    address = '',
  }) => {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${lastName};${firstName};;;`,
      `FN:${[firstName, lastName].filter(Boolean).join(' ')}`,
    ];
    if (company) lines.push(`ORG:${company}`);
    if (jobTitle) lines.push(`TITLE:${jobTitle}`);
    if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
    if (email) lines.push(`EMAIL;TYPE=INTERNET:${email}`);
    if (url) lines.push(`URL:${url}`);
    if (address) lines.push(`ADR;TYPE=WORK:;;${address};;;;`);
    lines.push('END:VCARD');
    return lines.join('\n');
  },

  email: ({ email = '', subject = '', body = '' }) => {
    if (!email) return '';
    const params = [];
    if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
    if (body) params.push(`body=${encodeURIComponent(body)}`);
    return `mailto:${email}${params.length ? `?${params.join('&')}` : ''}`;
  },

  sms: ({ phone = '', message = '' }) => {
    if (!phone) return '';
    return `smsto:${phone}:${message || ''}`;
  },

  tel: (phone = '') => (phone ? `tel:${phone}` : ''),
};
