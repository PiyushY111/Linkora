import { isHexColor } from '../../../utils/bioTheme';

const DETAIL_FIELDS = ['slug', 'title', 'bio', 'avatarUrl'];
const THEME_FIELDS = ['primaryColor', 'bgColor', 'font'];
const AVATAR_URL_PATTERN = /^https?:\/\/\S+$/i;

/** The editable details of a saved page, with empty strings for unset text. */
export function savedDetails(page) {
  return {
    slug: page.slug,
    title: page.title || '',
    bio: page.bio || '',
    avatarUrl: page.avatarUrl || '',
    theme: { ...page.theme },
  };
}

/** Saved details with the unsaved `edits` laid over them. */
export function mergeDetails(saved, edits) {
  return { ...saved, ...edits, theme: { ...saved.theme, ...edits.theme } };
}

/**
 * Only what `edits` actually changes from `saved`, shaped for PATCH
 * /api/bio-pages; empty when there is nothing to save.
 */
export function changedDetails(saved, edits) {
  const changes = {};
  for (const field of DETAIL_FIELDS) {
    if (edits[field] !== undefined && edits[field] !== saved[field]) changes[field] = edits[field];
  }
  const themeChanges = {};
  for (const token of THEME_FIELDS) {
    const value = edits.theme?.[token];
    if (value !== undefined && value !== saved.theme[token]) themeChanges[token] = value;
  }
  if (Object.keys(themeChanges).length > 0) changes.theme = themeChanges;
  return changes;
}

/** The first reason `details` can't be saved yet, or null. */
export function detailsProblem(details, slugStatus) {
  if (slugStatus === 'checking') return 'Checking the page address…';
  if (slugStatus === 'taken') return 'That page address is already taken';
  if (slugStatus === 'invalid' || !details.slug) return 'Choose a valid page address';
  if (details.bio.length > 280) return 'Bio can be at most 280 characters';
  if (details.avatarUrl && !AVATAR_URL_PATTERN.test(details.avatarUrl)) return 'Avatar URL must start with http(s)://';
  if (!isHexColor(details.theme.primaryColor) || !isHexColor(details.theme.bgColor)) {
    return 'Colors must be hex values like #C6FF3D';
  }
  return null;
}
