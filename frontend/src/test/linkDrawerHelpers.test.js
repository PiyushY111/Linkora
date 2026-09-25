import { describe, it, expect } from 'vitest';
import {
  EMPTY_EDIT_FORM,
  formFromLink,
  getLinkStatus,
  getQuotaProgress,
  presetExpiry,
  buildLinkUpdatePayload,
} from '../components/links/LinkDrawer/linkDrawerHelpers.js';

const now = new Date('2026-06-01T12:00:00.000Z');
const baseLink = { originalUrl: 'https://example.com', isActive: true };

describe('linkDrawerHelpers', () => {
  describe('getLinkStatus', () => {
    it('ranks flagged > limit reached > expired > active > paused', () => {
      const everything = { ...baseLink, abuseFlag: true, maxClicks: 5, clicks: 5, expiryDate: '2026-01-01' };
      expect(getLinkStatus(everything, now)).toBe('flagged');
      expect(getLinkStatus({ ...everything, abuseFlag: false }, now)).toBe('limit');
      expect(getLinkStatus({ ...everything, abuseFlag: false, clicks: 4 }, now)).toBe('expired');
      expect(getLinkStatus(baseLink, now)).toBe('active');
      expect(getLinkStatus({ ...baseLink, isActive: false }, now)).toBe('paused');
    });

    it('treats a zero or missing click cap as unlimited', () => {
      expect(getLinkStatus({ ...baseLink, maxClicks: 0, clicks: 10 }, now)).toBe('active');
    });
  });

  describe('getQuotaProgress', () => {
    it('uses the accent bar below 80%', () => {
      expect(getQuotaProgress({ maxClicks: 100, clicks: 79 })).toEqual({
        percent: 79,
        remaining: 21,
        isFull: false,
        barClass: 'bg-accent-400',
      });
    });

    it('warns from 80% and treats missing clicks as 0', () => {
      expect(getQuotaProgress({ maxClicks: 10, clicks: 8 }).barClass).toBe('bg-warning');
      expect(getQuotaProgress({ maxClicks: 10 }).percent).toBe(0);
    });

    it('caps the percentage at 100 and never reports negative remaining', () => {
      expect(getQuotaProgress({ maxClicks: 10, clicks: 15 })).toEqual({
        percent: 100,
        remaining: 0,
        isFull: true,
        barClass: 'bg-danger',
      });
    });
  });

  describe('formFromLink', () => {
    it('fills every edit field from the link', () => {
      const form = formFromLink({
        originalUrl: 'https://x',
        title: 'T',
        maxClicks: 50,
        expiryDate: '2026-07-01T08:30:00.000Z',
        utm: { source: 's' },
      });
      expect(Object.keys(form).sort()).toEqual(Object.keys(EMPTY_EDIT_FORM).sort());
      expect(form).toMatchObject({
        title: 'T',
        category: 'other',
        maxClicks: '50',
        enableMaxClicks: true,
        expiryDate: '2026-07-01T08:30',
        utmSource: 's',
        utmMedium: '',
        newPassword: '',
      });
    });
  });

  it('presetExpiry returns a datetime-local value hours from now', () => {
    expect(presetExpiry(24, now)).toBe('2026-06-02T12:00');
  });

  describe('buildLinkUpdatePayload', () => {
    const link = {
      originalUrl: 'https://example.com',
      maxClicks: 10,
      expiredRedirectUrl: 'https://old-fallback',
      iosRedirect: 'https://ios',
    };
    const form = (overrides = {}) => ({ ...formFromLink(link), ...overrides });

    it('leaves out an unchanged destination and sends the basics', () => {
      const payload = buildLinkUpdatePayload(link, form({ title: 'New' }));
      expect(payload).not.toHaveProperty('originalUrl');
      expect(payload).toMatchObject({ title: 'New', category: 'other', tags: [] });
    });

    it('sends a changed, trimmed destination', () => {
      expect(buildLinkUpdatePayload(link, form({ originalUrl: ' https://new ' })).originalUrl).toBe('https://new');
    });

    it('prefers removePassword over a typed password', () => {
      expect(buildLinkUpdatePayload(link, form({ removePassword: true, newPassword: 'x' }))).toMatchObject({
        removePassword: true,
      });
      expect(buildLinkUpdatePayload(link, form({ newPassword: ' pw ' })).password).toBe('pw');
    });

    it('removes the click cap when it is turned off on a link that had one', () => {
      expect(buildLinkUpdatePayload(link, form({ enableMaxClicks: false })).removeMaxClicks).toBe(true);
      expect(buildLinkUpdatePayload(link, form({ maxClicks: '25' })).maxClicks).toBe(25);
    });

    it('sends remove flags for cleared optional URLs only if the link had them', () => {
      const payload = buildLinkUpdatePayload(link, form({ expiredRedirectUrl: '  ', iosRedirect: '' }));
      expect(payload).toMatchObject({ removeExpiredRedirectUrl: true, removeIosRedirect: true });
      expect(payload).not.toHaveProperty('removeAndroidRedirect');
    });

    it('converts the expiry to ISO, or sends removeExpiryDate', () => {
      expect(buildLinkUpdatePayload(link, form({ expiryDate: '2026-07-01T08:30' })).expiryDate).toBe(
        new Date('2026-07-01T08:30').toISOString()
      );
      expect(buildLinkUpdatePayload(link, form({ removeExpiryDate: true })).removeExpiryDate).toBe(true);
    });

    it('sends utm only when at least one field is set', () => {
      expect(buildLinkUpdatePayload(link, form())).not.toHaveProperty('utm');
      expect(buildLinkUpdatePayload(link, form({ utmCampaign: ' c ' })).utm).toEqual({
        source: '',
        medium: '',
        campaign: 'c',
      });
    });
  });
});
