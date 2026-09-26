import { describe, it, expect } from 'vitest';
import {
  savedDetails,
  mergeDetails,
  changedDetails,
  detailsProblem,
} from '../components/bio/builder/bioBuilderHelpers.js';
import { toVisibleBioItems, BIO_THEME_PRESETS } from '../utils/bioTheme.js';
import { QR_DESIGNER_PRESETS } from '../utils/qrPresets.js';

const page = {
  slug: 'jane',
  title: 'Jane',
  bio: null,
  avatarUrl: null,
  theme: { primaryColor: '#C6FF3D', bgColor: '#0A0A0B', font: 'sans' },
};
const saved = savedDetails(page);

describe('bioBuilderHelpers', () => {
  it('fills unset text fields with empty strings', () => {
    expect(saved).toEqual({ ...page, bio: '', avatarUrl: '' });
  });

  it('lays edits over the saved details, merging theme tokens', () => {
    const details = mergeDetails(saved, { title: 'New', theme: { font: 'mono' } });
    expect(details.title).toBe('New');
    expect(details.theme).toEqual({ primaryColor: '#C6FF3D', bgColor: '#0A0A0B', font: 'mono' });
  });

  it('sends only what changed, and nothing for edits that match the saved values', () => {
    expect(changedDetails(saved, { theme: {} })).toEqual({});
    expect(changedDetails(saved, { title: 'Jane', theme: { font: 'sans' } })).toEqual({});
    expect(changedDetails(saved, { bio: 'Hi', theme: { bgColor: '#FFFFFF', font: 'sans' } })).toEqual({
      bio: 'Hi',
      theme: { bgColor: '#FFFFFF' },
    });
  });

  it('explains why details cannot be saved yet', () => {
    const ok = mergeDetails(saved, {});
    expect(detailsProblem(ok, 'current')).toBeNull();
    expect(detailsProblem(ok, 'taken')).toMatch(/taken/);
    expect(detailsProblem(ok, 'checking')).toMatch(/Checking/);
    expect(detailsProblem(mergeDetails(saved, { avatarUrl: 'javascript:alert(1)' }), 'current')).toMatch(/Avatar/);
    expect(detailsProblem(mergeDetails(saved, { bio: 'x'.repeat(281) }), 'current')).toMatch(/280/);
    expect(detailsProblem(mergeDetails(saved, { theme: { bgColor: '#FFF' } }), 'current')).toMatch(/hex/);
  });
});

describe('toVisibleBioItems', () => {
  it('matches the public page: only active items whose link is still active', () => {
    const link = (shortUrl, isActive = true) => ({ shortUrl, isActive });
    const items = [
      { _id: 'a', label: 'A', icon: 'github', active: true, link: link('https://l.ink/a') },
      { _id: 'b', label: 'B', icon: '', active: false, link: link('https://l.ink/b') },
      { _id: 'c', label: 'C', icon: '', active: true, link: link('https://l.ink/c', false) },
      { _id: 'd', label: 'D', icon: '', active: true, link: null },
      { _id: 'e', label: 'E', icon: '', active: true, link: link('https://l.ink/e') },
    ];
    expect(toVisibleBioItems(items)).toEqual([
      { id: 'a', label: 'A', icon: 'github', shortUrl: 'https://l.ink/a' },
      { id: 'e', label: 'E', icon: null, shortUrl: 'https://l.ink/e' },
    ]);
  });
});

describe('BIO_THEME_PRESETS', () => {
  it('reuses the QR studio palettes', () => {
    expect(BIO_THEME_PRESETS).toHaveLength(QR_DESIGNER_PRESETS.length);
    expect(BIO_THEME_PRESETS[0]).toEqual({
      id: QR_DESIGNER_PRESETS[0].id,
      name: QR_DESIGNER_PRESETS[0].name,
      primaryColor: QR_DESIGNER_PRESETS[0].config.dotsColor,
      bgColor: QR_DESIGNER_PRESETS[0].config.bgColor,
    });
  });
});
