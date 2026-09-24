import { describe, it, expect } from 'vitest';
import {
  QR_DOT_TYPES,
  QR_CORNER_SQUARE_TYPES,
  QR_CORNER_DOT_TYPES,
  QR_FRAME_STYLES,
  QR_BRAND_ICONS,
  QR_DESIGNER_PRESETS,
  DEFAULT_QR_CONFIG,
  formatQrData,
} from '../utils/qrPresets.js';

describe('QR Presets & Formatters', () => {
  describe('Schema Integrity', () => {
    it('defines valid dot types with id and label', () => {
      expect(QR_DOT_TYPES.length).toBeGreaterThan(0);
      for (const item of QR_DOT_TYPES) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('label');
        expect(typeof item.id).toBe('string');
      }
    });

    it('defines corner square and dot types', () => {
      expect(QR_CORNER_SQUARE_TYPES.length).toBeGreaterThan(0);
      expect(QR_CORNER_DOT_TYPES.length).toBeGreaterThan(0);
      expect(QR_FRAME_STYLES.length).toBeGreaterThan(0);
    });

    it('contains branded SVG icons', () => {
      expect(QR_BRAND_ICONS.length).toBeGreaterThan(0);
      for (const icon of QR_BRAND_ICONS) {
        expect(icon).toHaveProperty('id');
        expect(icon).toHaveProperty('src');
        expect(icon.src).toMatch(/^data:image\/svg\+xml/);
      }
    });

    it('contains designer presets with valid config', () => {
      expect(QR_DESIGNER_PRESETS.length).toBeGreaterThan(0);
      for (const preset of QR_DESIGNER_PRESETS) {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('config');
        expect(preset.config).toHaveProperty('dotsColor');
        expect(preset.config).toHaveProperty('bgColor');
      }
    });

    it('defines complete DEFAULT_QR_CONFIG', () => {
      expect(DEFAULT_QR_CONFIG).toHaveProperty('dotsType');
      expect(DEFAULT_QR_CONFIG).toHaveProperty('dotsColor');
      expect(DEFAULT_QR_CONFIG).toHaveProperty('bgColor');
      expect(DEFAULT_QR_CONFIG).toHaveProperty('frame');
    });
  });

  describe('formatQrData', () => {
    it('formats plain URLs, prepending https:// if missing', () => {
      expect(formatQrData.url('example.com')).toBe('https://example.com');
      expect(formatQrData.url('https://linkora.app/abc')).toBe('https://linkora.app/abc');
      expect(formatQrData.url('http://internal.net')).toBe('http://internal.net');
      expect(formatQrData.url('')).toBe('');
    });

    it('formats plain text content', () => {
      expect(formatQrData.text('Hello World')).toBe('Hello World');
      expect(formatQrData.text('')).toBe('');
    });

    it('formats WiFi configuration string', () => {
      const wifi = formatQrData.wifi({
        ssid: 'Office-WiFi',
        password: 'SecretPassword123',
        encryption: 'WPA',
        hidden: false,
      });
      expect(wifi).toBe('WIFI:S:Office-WiFi;T:WPA;P:SecretPassword123;H:false;;');
    });

    it('formats vCard v3.0 standard contact cards', () => {
      const vcard = formatQrData.vcard({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+1234567890',
        email: 'jane@example.com',
        company: 'Acme Corp',
      });
      expect(vcard).toContain('BEGIN:VCARD');
      expect(vcard).toContain('VERSION:3.0');
      expect(vcard).toContain('FN:Jane Doe');
      expect(vcard).toContain('TEL;TYPE=CELL:+1234567890');
      expect(vcard).toContain('EMAIL;TYPE=INTERNET:jane@example.com');
      expect(vcard).toContain('ORG:Acme Corp');
      expect(vcard).toContain('END:VCARD');
    });

    it('formats email with subject and body query parameters', () => {
      const mailto = formatQrData.email({
        email: 'support@linkora.app',
        subject: 'Inquiry',
        body: 'Hello team',
      });
      expect(mailto).toBe('mailto:support@linkora.app?subject=Inquiry&body=Hello%20team');
    });

    it('formats SMS and Tel URIs', () => {
      expect(formatQrData.sms({ phone: '+1234567890', message: 'Hello' })).toBe('smsto:+1234567890:Hello');
      expect(formatQrData.tel('+1234567890')).toBe('tel:+1234567890');
      expect(formatQrData.tel('')).toBe('');
    });
  });
});
