import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from '../utils/authRedirect.js';

describe('safeRedirectPath', () => {
  it('keeps same-site paths', () => {
    expect(safeRedirectPath('/invite/abc123')).toBe('/invite/abc123');
    expect(safeRedirectPath('/analytics/all?range=7d')).toBe('/analytics/all?range=7d');
  });

  it('falls back to the dashboard for anything that could leave the site', () => {
    for (const from of [undefined, null, '', 'invite/abc', 'https://evil.example', '//evil.example', '/\\evil.example', 42]) {
      expect(safeRedirectPath(from)).toBe('/dashboard');
    }
  });
});
