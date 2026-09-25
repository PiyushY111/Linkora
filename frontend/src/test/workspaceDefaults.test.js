import { describe, it, expect } from 'vitest';
import { workspaceQrDefault, workspaceUtmDefaults } from '../utils/workspaceDefaults.js';
import { DEFAULT_QR_CONFIG } from '../utils/qrPresets.js';

describe('workspaceQrDefault', () => {
  it('is the built-in style when the workspace has none', () => {
    expect(workspaceQrDefault(null)).toBe(DEFAULT_QR_CONFIG);
    expect(workspaceQrDefault({ settings: { defaultQrStyle: null } })).toBe(DEFAULT_QR_CONFIG);
  });

  it('layers a partial workspace style over the built-in one, including nested objects', () => {
    const ws = { settings: { defaultQrStyle: { dotsColor: '#112233', frame: { text: 'ACME' } } } };
    const style = workspaceQrDefault(ws);
    expect(style.dotsColor).toBe('#112233');
    expect(style.dotsType).toBe(DEFAULT_QR_CONFIG.dotsType);
    expect(style.frame).toEqual({ ...DEFAULT_QR_CONFIG.frame, text: 'ACME' });
    expect(style.gradient).toEqual(DEFAULT_QR_CONFIG.gradient);
  });
});

describe('workspaceUtmDefaults', () => {
  const user = { defaultUtm: { source: 'me', medium: 'my-medium', campaign: '' } };

  it('prefers the workspace default per field, then the user default', () => {
    const ws = { settings: { defaultUtmParams: { source: 'team', campaign: 'launch' } } };
    expect(workspaceUtmDefaults(ws, user)).toEqual({
      utmSource: 'team',
      utmMedium: 'my-medium',
      utmCampaign: 'launch',
      utmTerm: '',
      utmContent: '',
    });
  });

  it('falls back to the user defaults, then empty', () => {
    expect(workspaceUtmDefaults({ settings: { defaultUtmParams: null } }, user).utmSource).toBe('me');
    expect(workspaceUtmDefaults(null, null)).toEqual({ utmSource: '', utmMedium: '', utmCampaign: '', utmTerm: '', utmContent: '' });
  });
});
