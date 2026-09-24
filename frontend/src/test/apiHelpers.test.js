import { describe, it, expect } from 'vitest';
import { getApiOrigin } from '../services/api.js';

describe('Frontend API Configuration & Helpers', () => {
  it('getApiOrigin strips trailing /api from the URL origin', () => {
    const origin = getApiOrigin();
    expect(origin).not.toMatch(/\/api\/?$/);
  });

  it('verifies standard query string construction', () => {
    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('limit', '25');
    params.set('search', 'campaign');
    expect(params.toString()).toBe('page=1&limit=25&search=campaign');
  });

  it('validates URL path formatting for short links', () => {
    const formatShortUrl = (domain, code) => {
      const base = domain.replace(/\/+$/, '');
      return `${base}/${code}`;
    };
    expect(formatShortUrl('https://linkora.app', 'xyz123')).toBe('https://linkora.app/xyz123');
    expect(formatShortUrl('https://linkora.app/', 'xyz123')).toBe('https://linkora.app/xyz123');
  });
});
