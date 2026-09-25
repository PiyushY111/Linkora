import { describe, it, expect } from 'vitest';
import { isSafeSsoUrl, SSO_ERROR_MESSAGES } from '../utils/sso.js';

describe('isSafeSsoUrl', () => {
  it('accepts https URLs', () => {
    expect(isSafeSsoUrl('https://api.workos.com/sso/authorize?connection=conn_1&state=s')).toBe(true);
  });

  it('rejects anything that is not https', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'http://api.workos.com/sso', '/relative', '', null, 42]) {
      expect(isSafeSsoUrl(url)).toBe(false);
    }
  });
});

describe('SSO_ERROR_MESSAGES', () => {
  it('covers every code the backend redirects with', () => {
    expect(Object.keys(SSO_ERROR_MESSAGES).sort()).toEqual(['sso_failed', 'sso_not_linked', 'sso_required']);
  });
});
