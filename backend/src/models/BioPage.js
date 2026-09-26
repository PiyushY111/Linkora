import mongoose from 'mongoose';
import validator from 'validator';

// Lowercase letters, digits and single inner hyphens: "jane-doe", not "-jane".
export const BIO_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const BIO_SLUG_MIN_LENGTH = 3;
export const BIO_SLUG_MAX_LENGTH = 40;
export const BIO_MAX_LENGTH = 280;
export const BIO_MAX_ITEMS = 100;
export const BIO_ITEM_LABEL_MAX_LENGTH = 100;
// An icon id (e.g. one of the QR studio's brand icon ids), not markup.
export const BIO_ITEM_ICON_PATTERN = /^[a-z0-9-]{0,50}$/;

// Theme tokens share names with the QR studio's (utils/qrPresets.js uses
// bgColor), so the frontend can drive both with one theme-token component.
// Colors are #rrggbb, as the QR color pickers produce, and fonts are the
// families the app loads: both end up in a public page's styles, so neither
// may be free-form.
export const BIO_THEME_FONTS = ['sans', 'mono'];
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidBioSlug(slug) {
  return (
    typeof slug === 'string' &&
    slug.length >= BIO_SLUG_MIN_LENGTH &&
    slug.length <= BIO_SLUG_MAX_LENGTH &&
    BIO_SLUG_PATTERN.test(slug)
  );
}

const hexColor = (fallback) => ({
  type: String,
  default: fallback,
  trim: true,
  match: [HEX_COLOR_PATTERN, 'Theme colors must be hex colors like #C6FF3D'],
});

const bioItemSchema = new mongoose.Schema({
  label: {
    type: String,
    required: [true, 'Item label is required'],
    trim: true,
    maxlength: [BIO_ITEM_LABEL_MAX_LENGTH, `Item label cannot exceed ${BIO_ITEM_LABEL_MAX_LENGTH} characters`],
  },
  icon: {
    type: String,
    trim: true,
    match: [BIO_ITEM_ICON_PATTERN, 'Item icon must be an icon id (lowercase letters, numbers, hyphens)'],
  },
  // Clicks go through this Link's short URL, so they reach the existing
  // redirect and analytics pipeline like any other click.
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true },
  order: { type: Number, required: true, min: 0 },
  active: { type: Boolean, default: true },
});

const bioPageSchema = new mongoose.Schema(
  {
    // One bio page per workspace for now; see the unique index below.
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      lowercase: true,
      trim: true,
      validate: {
        validator: isValidBioSlug,
        message: `Slug must be ${BIO_SLUG_MIN_LENGTH}-${BIO_SLUG_MAX_LENGTH} lowercase letters, numbers or hyphens, and can't start or end with a hyphen`,
      },
    },
    title: { type: String, trim: true, maxlength: [100, 'Title cannot exceed 100 characters'] },
    bio: { type: String, trim: true, maxlength: [BIO_MAX_LENGTH, `Bio cannot exceed ${BIO_MAX_LENGTH} characters`] },
    avatarUrl: {
      type: String,
      trim: true,
      validate: {
        validator: (url) => !url || validator.isURL(url, { protocols: ['http', 'https'], require_protocol: true }),
        message: 'Avatar URL must be an http(s) URL',
      },
    },
    theme: {
      primaryColor: hexColor('#C6FF3D'),
      bgColor: hexColor('#0A0A0B'),
      font: {
        type: String,
        enum: { values: BIO_THEME_FONTS, message: `Theme font must be one of: ${BIO_THEME_FONTS.join(', ')}` },
        default: 'sans',
      },
    },
    items: {
      type: [bioItemSchema],
      default: [],
      validate: {
        validator: (items) => items.length <= BIO_MAX_ITEMS,
        message: `A bio page can have at most ${BIO_MAX_ITEMS} items`,
      },
    },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    // Reordering is read-modify-save; a concurrent add/remove bumps __v
    // (see bioPageController), so a stale reorder fails instead of silently
    // dropping or resurrecting items.
    optimisticConcurrency: true,
  }
);

bioPageSchema.index({ slug: 1 }, { unique: true });
bioPageSchema.index({ workspace: 1 }, { unique: true });

const BioPage = mongoose.model('BioPage', bioPageSchema);

export default BioPage;
