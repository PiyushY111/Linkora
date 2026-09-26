import { describe, it, expect } from 'vitest';
import { resolveBioTheme, fontClass, readableTextColor, findBioIcon, DEFAULT_BIO_THEME } from '../utils/bioTheme.js';

describe('bioTheme', () => {
  describe('resolveBioTheme', () => {
    it('keeps valid tokens', () => {
      const theme = { primaryColor: '#FF5C5C', bgColor: '#0e0d12', font: 'mono' };
      expect(resolveBioTheme(theme)).toEqual(theme);
    });

    it('replaces missing or malformed tokens with the defaults, so they never reach a style', () => {
      expect(resolveBioTheme(undefined)).toEqual(DEFAULT_BIO_THEME);
      expect(resolveBioTheme({ primaryColor: 'red;background:url(x)', bgColor: '#FFF', font: 'Comic Sans' })).toEqual(
        DEFAULT_BIO_THEME
      );
    });
  });

  it('maps fonts to the loaded Tailwind families', () => {
    expect(fontClass('sans')).toBe('font-sans');
    expect(fontClass('mono')).toBe('font-mono');
    expect(fontClass('unknown')).toBe('font-sans');
  });

  describe('readableTextColor', () => {
    it('uses light text on dark colors and dark text on light colors', () => {
      expect(readableTextColor('#0A0A0B')).toBe('#F5F5F7');
      expect(readableTextColor('#FFFFFF')).toBe('#0A0A0B');
      expect(readableTextColor('#C6FF3D')).toBe('#0A0A0B');
      expect(readableTextColor('#1D4ED8')).toBe('#F5F5F7');
    });
  });

  it('finds QR studio brand icons by id', () => {
    expect(findBioIcon('github')?.name).toBe('GitHub');
    expect(findBioIcon('nope')).toBeNull();
    expect(findBioIcon(undefined)).toBeNull();
  });
});
