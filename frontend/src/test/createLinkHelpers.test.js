import { describe, it, expect } from 'vitest';
import {
  generateRandomAlias,
  extractDomain,
  buildDestinationUrl,
  computeExpiryDate,
  validateVariants,
  updateVariantAt,
  addTagFromInput,
  buildCreateLinkPayload,
} from '../components/CreateLinkModal/createLinkHelpers.js';
import { EMPTY_FORM } from '../components/CreateLinkModal/constants.js';
import { DEFAULT_QR_CONFIG } from '../utils/qrPresets.js';

const form = (overrides = {}) => ({ ...EMPTY_FORM, ...overrides });

describe('createLinkHelpers', () => {
  describe('generateRandomAlias', () => {
    it('returns 6 characters from the unambiguous alphabet', () => {
      for (let i = 0; i < 50; i++) {
        expect(generateRandomAlias()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
      }
    });

    it('is driven by the injected random source', () => {
      expect(generateRandomAlias(() => 0)).toBe('aaaaaa');
      expect(generateRandomAlias(() => 0.9999)).toBe('999999');
    });
  });

  describe('extractDomain', () => {
    it('adds https:// when the protocol is missing', () => {
      expect(extractDomain('  example.com/path ')).toBe('example.com');
    });

    it('returns null for empty or unparseable input', () => {
      expect(extractDomain('')).toBeNull();
      expect(extractDomain('http://')).toBeNull();
    });
  });

  describe('buildDestinationUrl', () => {
    it('returns an empty string for an empty destination', () => {
      expect(buildDestinationUrl(form({ originalUrl: '   ', utmSource: 'x' }))).toBe('');
    });

    it('appends only the non-empty, trimmed UTM parameters', () => {
      const url = buildDestinationUrl(form({ originalUrl: 'example.com/p?a=1', utmSource: ' google ', utmCampaign: 'launch' }));
      expect(url).toBe('https://example.com/p?a=1&utm_source=google&utm_campaign=launch');
    });

    it('overrides an existing utm parameter instead of duplicating it', () => {
      const url = buildDestinationUrl(form({ originalUrl: 'https://example.com/?utm_source=old', utmSource: 'new' }));
      expect(url).toBe('https://example.com/?utm_source=new');
    });

    it('falls back to the raw input when it cannot be parsed', () => {
      expect(buildDestinationUrl(form({ originalUrl: 'http://', utmSource: 'x' }))).toBe('http://');
    });
  });

  describe('computeExpiryDate', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    it('adds the preset window to now', () => {
      expect(computeExpiryDate(form({ expiryOption: '24h' }), now)).toBe('2026-01-02T00:00:00.000Z');
      expect(computeExpiryDate(form({ expiryOption: '7 Days' }), now)).toBe('2026-01-08T00:00:00.000Z');
    });

    it('returns null for Never, and for Custom without a date', () => {
      expect(computeExpiryDate(form({ expiryOption: 'Never' }), now)).toBeNull();
      expect(computeExpiryDate(form({ expiryOption: 'Custom', customExpiryDate: '' }), now)).toBeNull();
    });

    it('uses the custom date when one is set', () => {
      const custom = '2026-06-01T12:30';
      expect(computeExpiryDate(form({ expiryOption: 'Custom', customExpiryDate: custom }), now)).toBe(
        new Date(custom).toISOString()
      );
    });
  });

  describe('validateVariants', () => {
    it('requires the weights to sum to exactly 100', () => {
      expect(validateVariants([{ name: 'A', url: 'x', weight: 60 }, { name: 'B', url: 'y', weight: 30 }])).toBe(
        'Variant weights must sum to exactly 100% (currently 90%)'
      );
    });

    it('names the first variant without a URL', () => {
      expect(
        validateVariants([
          { name: 'A', url: 'x', weight: 50 },
          { name: 'B', url: '  ', weight: 50 },
        ])
      ).toBe('Please provide a destination URL for B');
    });

    it('accepts string weights and returns null when valid', () => {
      expect(validateVariants([{ name: 'A', url: 'x', weight: '70' }, { name: 'B', url: 'y', weight: 30 }])).toBeNull();
    });
  });

  describe('updateVariantAt', () => {
    it('changes one field of one variant without touching the originals', () => {
      const snapshot = JSON.parse(JSON.stringify(EMPTY_FORM.variants));
      const next = updateVariantAt(EMPTY_FORM.variants, 1, 'url', 'https://b.example.com');

      expect(next[1]).toEqual({ ...snapshot[1], url: 'https://b.example.com' });
      expect(next[0]).toBe(EMPTY_FORM.variants[0]);
      expect(EMPTY_FORM.variants).toEqual(snapshot);
    });
  });

  describe('addTagFromInput', () => {
    it('adds a trimmed tag without surrounding commas and clears the input', () => {
      const next = addTagFromInput(form({ tags: ['a'], tagInput: ' ,promo, ' }));
      expect(next.tags).toEqual(['a', 'promo']);
      expect(next.tagInput).toBe('');
    });

    it('ignores duplicates and empty input without clearing the input', () => {
      const dup = form({ tags: ['promo'], tagInput: 'promo' });
      expect(addTagFromInput(dup)).toBe(dup);
      const empty = form({ tagInput: ' , ' });
      expect(addTagFromInput(empty)).toBe(empty);
    });
  });

  describe('buildCreateLinkPayload', () => {
    it('sends only the required fields for a bare form', () => {
      const payload = buildCreateLinkPayload(form({ originalUrl: ' example.com ' }), {
        destinationUrl: '',
        qrCode: null,
        expiryDate: null,
      });
      expect(payload).toEqual({
        originalUrl: 'example.com',
        category: 'marketing',
        tags: [],
        qrConfig: DEFAULT_QR_CONFIG,
      });
    });

    it('trims optional fields and includes them only when set', () => {
      const payload = buildCreateLinkPayload(
        form({
          customAlias: ' alias ',
          title: ' T ',
          enablePassword: true,
          password: ' pw ',
          enableMaxClicks: true,
          maxClicks: '25',
          iosRedirect: ' https://ios ',
          utmMedium: ' cpc ',
          ogTitle: ' OG ',
        }),
        { destinationUrl: 'https://example.com/?utm_medium=cpc', qrCode: 'data:image/png', expiryDate: '2026-01-02T00:00:00.000Z' }
      );
      expect(payload).toMatchObject({
        originalUrl: 'https://example.com/?utm_medium=cpc',
        qrCode: 'data:image/png',
        customAlias: 'alias',
        title: 'T',
        password: 'pw',
        maxClicks: 25,
        expiryDate: '2026-01-02T00:00:00.000Z',
        iosRedirect: 'https://ios',
        utm: { source: '', medium: 'cpc', campaign: '', term: '', content: '' },
        ogTitle: 'OG',
      });
      expect(payload).not.toHaveProperty('description');
      expect(payload).not.toHaveProperty('routingType');
    });

    it('drops the password and click limit when their toggles are off', () => {
      const payload = buildCreateLinkPayload(form({ password: 'pw', maxClicks: '10' }), {
        destinationUrl: 'https://x',
        expiryDate: null,
      });
      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('maxClicks');
    });

    it('includes routing type and variants for an A/B test', () => {
      const variants = [{ id: 'a', name: 'A', url: 'https://a', weight: 100 }];
      const payload = buildCreateLinkPayload(form({ routingType: 'ab_test', variants }), {
        destinationUrl: 'https://x',
        expiryDate: null,
      });
      expect(payload.routingType).toBe('ab_test');
      expect(payload.variants).toBe(variants);
    });
  });
});
