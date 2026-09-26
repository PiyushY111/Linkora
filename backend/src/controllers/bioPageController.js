import mongoose from 'mongoose';
import BioPage, { BIO_MAX_ITEMS, BIO_ITEM_LABEL_MAX_LENGTH, BIO_ITEM_ICON_PATTERN, isValidBioSlug } from '../models/BioPage.js';
import Link from '../models/Link.js';
import { createLinkRecord, announceLinkCreated } from './linkController.js';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors.js';
import { logger } from '../config/logger.js';
import { getSpaShell } from '../services/spaShell.js';
import { renderBioPageHtml, bioPageCsp } from '../services/bioPageHtml.js';
import { recordBioPageView } from '../services/bioPageViews.js';

const PAGE_FIELDS = ['slug', 'title', 'bio', 'avatarUrl'];
const THEME_FIELDS = ['primaryColor', 'bgColor', 'font'];
// What the builder needs to show where an item goes.
const LINK_SUMMARY_FIELDS = 'shortCode shortUrl originalUrl title isActive';
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function normalizeSlug(slug) {
  return typeof slug === 'string' ? slug.trim().toLowerCase() : '';
}

function assertString(value, name) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new ValidationError(`${name} must be a string`);
  }
}

/**
 * The editable page fields present in `body`, as dotted paths for
 * Document#set, so a partial theme update leaves the other tokens alone.
 * Anything else in the body (items, viewCount, workspace, owner) is ignored.
 */
function editableUpdates(body = {}) {
  const updates = {};
  for (const name of PAGE_FIELDS) {
    if (body[name] === undefined) continue;
    assertString(body[name], name);
    updates[name] = body[name];
  }
  if (body.theme !== undefined) {
    if (!body.theme || typeof body.theme !== 'object' || Array.isArray(body.theme)) {
      throw new ValidationError('theme must be an object');
    }
    for (const name of THEME_FIELDS) {
      if (body.theme[name] === undefined) continue;
      assertString(body.theme[name], `theme.${name}`);
      updates[`theme.${name}`] = body.theme[name];
    }
  }
  return updates;
}

/** Maps index and version conflicts to 409s the builder can show. */
function toConflict(err) {
  if (err?.code === 11000 && err.keyPattern?.slug) return new ConflictError('This slug is already taken');
  if (err?.code === 11000 && err.keyPattern?.workspace) {
    return new ConflictError('This workspace already has a bio page');
  }
  if (err instanceof mongoose.Error.VersionError) {
    return new ConflictError('The bio page changed while you were editing it. Reload and try again.');
  }
  return err;
}

/**
 * The workspace's page as the builder sees it: items in display order, each
 * with a summary of its link. A link that no longer belongs to this
 * workspace comes back as `link: null` rather than leaking another
 * workspace's link.
 */
async function serializeBioPage(workspaceId) {
  const page = await BioPage.findOne({ workspace: workspaceId })
    .populate({ path: 'items.linkId', select: LINK_SUMMARY_FIELDS, match: { workspace: workspaceId } })
    .lean();
  if (!page) throw new NotFoundError('This workspace has no bio page yet');

  const items = [...page.items]
    .sort((a, b) => a.order - b.order || String(a._id).localeCompare(String(b._id)))
    .map(({ linkId, ...item }) => ({ ...item, linkId: linkId?._id ?? null, link: linkId ?? null }));
  return { ...page, items };
}

async function findWorkspacePage(workspaceId) {
  const page = await BioPage.findOne({ workspace: workspaceId });
  if (!page) throw new NotFoundError('This workspace has no bio page yet');
  return page;
}

/**
 * The Link an item should point at: an existing one of this workspace's
 * links, or a new link created exactly as POST /api/links creates one.
 */
async function resolveItemLink(req, { linkId, destinationUrl, label }) {
  if (linkId) {
    const link = OBJECT_ID_PATTERN.test(String(linkId))
      ? await Link.findOne({ _id: linkId, workspace: req.activeWorkspace._id }).select('_id').lean()
      : null;
    if (!link) throw new NotFoundError('Link not found');
    return link;
  }

  const link = await createLinkRecord(
    { userId: req.user.id, workspaceId: req.activeWorkspace._id },
    { originalUrl: destinationUrl, title: label }
  );
  announceLinkCreated(req, link);
  return link;
}

// GET /api/bio-pages
export const getBioPage = async (req, res) => {
  res.status(200).json({ success: true, bioPage: await serializeBioPage(req.activeWorkspace._id) });
};

// POST /api/bio-pages
export const createBioPage = async (req, res) => {
  const workspaceId = req.activeWorkspace._id;
  if (await BioPage.exists({ workspace: workspaceId })) {
    throw new ConflictError('This workspace already has a bio page');
  }

  const page = new BioPage({ workspace: workspaceId, owner: req.user.id });
  page.set(editableUpdates(req.body));
  try {
    await page.save();
  } catch (err) {
    throw toConflict(err);
  }

  res.status(201).json({ success: true, bioPage: await serializeBioPage(workspaceId) });
};

// PATCH /api/bio-pages
export const updateBioPage = async (req, res) => {
  const page = await findWorkspacePage(req.activeWorkspace._id);
  page.set(editableUpdates(req.body));
  try {
    await page.save();
  } catch (err) {
    throw toConflict(err);
  }

  res.status(200).json({ success: true, bioPage: await serializeBioPage(req.activeWorkspace._id) });
};

// POST /api/bio-pages/items
export const addBioPageItem = async (req, res) => {
  const { linkId, destinationUrl, label, icon } = req.body;
  if (Boolean(linkId) === Boolean(destinationUrl)) {
    throw new ValidationError('Provide either linkId or destinationUrl');
  }
  assertString(icon, 'icon');

  const page = await findWorkspacePage(req.activeWorkspace._id);
  if (page.items.length >= BIO_MAX_ITEMS) {
    throw new ValidationError(`A bio page can have at most ${BIO_MAX_ITEMS} items`);
  }

  const link = await resolveItemLink(req, { linkId, destinationUrl, label });
  const order = page.items.reduce((next, item) => Math.max(next, item.order + 1), 0);

  // $push rather than save, so adding never fails on a concurrent edit; the
  // $inc makes any in-flight reorder of the old item list fail instead.
  const updated = await BioPage.findOneAndUpdate(
    { _id: page._id, [`items.${BIO_MAX_ITEMS - 1}`]: { $exists: false } },
    { $push: { items: { label, icon, linkId: link._id, order } }, $inc: { __v: 1 } },
    { runValidators: true }
  );
  if (!updated) throw new ValidationError(`A bio page can have at most ${BIO_MAX_ITEMS} items`);

  res.status(201).json({ success: true, bioPage: await serializeBioPage(req.activeWorkspace._id) });
};

// PUT /api/bio-pages/items/order  { itemIds: [...] }, every item exactly once
export const reorderBioPageItems = async (req, res) => {
  const { itemIds } = req.body;
  if (!Array.isArray(itemIds) || !itemIds.every((id) => typeof id === 'string')) {
    throw new ValidationError('itemIds must be an array of item ids');
  }

  const page = await findWorkspacePage(req.activeWorkspace._id);
  const currentIds = new Set(page.items.map((item) => String(item._id)));
  const isPermutation =
    itemIds.length === currentIds.size && new Set(itemIds).size === itemIds.length && itemIds.every((id) => currentIds.has(id));
  if (!isPermutation) {
    throw new ValidationError('itemIds must list every item on the page exactly once');
  }

  const position = new Map(itemIds.map((id, index) => [id, index]));
  for (const item of page.items) {
    item.order = position.get(String(item._id));
  }
  try {
    await page.save();
  } catch (err) {
    throw toConflict(err);
  }

  res.status(200).json({ success: true, bioPage: await serializeBioPage(req.activeWorkspace._id) });
};

/**
 * The label/icon changes in `body`, as positional $set paths. Checked here
 * rather than left to update validators, which don't reliably run on
 * positional (items.$) paths.
 */
function itemUpdates(body = {}) {
  const updates = {};
  if (body.label !== undefined) {
    assertString(body.label, 'label');
    const label = (body.label ?? '').trim();
    if (!label) throw new ValidationError('Item label is required');
    if (label.length > BIO_ITEM_LABEL_MAX_LENGTH) {
      throw new ValidationError(`Item label cannot exceed ${BIO_ITEM_LABEL_MAX_LENGTH} characters`);
    }
    updates['items.$.label'] = label;
  }
  if (body.icon !== undefined) {
    assertString(body.icon, 'icon');
    const icon = (body.icon ?? '').trim();
    if (!BIO_ITEM_ICON_PATTERN.test(icon)) {
      throw new ValidationError('Item icon must be an icon id (lowercase letters, numbers, hyphens)');
    }
    updates['items.$.icon'] = icon;
  }
  if (Object.keys(updates).length === 0) throw new ValidationError('Provide a label or icon to update');
  return updates;
}

// PATCH /api/bio-pages/items/:itemId  { label?, icon? }
export const updateBioPageItem = async (req, res) => {
  const { itemId } = req.params;
  const updates = itemUpdates(req.body);
  const updated = OBJECT_ID_PATTERN.test(itemId)
    ? await BioPage.findOneAndUpdate({ workspace: req.activeWorkspace._id, 'items._id': itemId }, { $set: updates })
    : null;
  if (!updated) throw new NotFoundError('Item not found');

  res.status(200).json({ success: true, bioPage: await serializeBioPage(req.activeWorkspace._id) });
};

// DELETE /api/bio-pages/items/:itemId. Only unlists the item: the Link
// itself may be in use elsewhere, so it is left alone.
export const removeBioPageItem = async (req, res) => {
  const { itemId } = req.params;
  const updated = OBJECT_ID_PATTERN.test(itemId)
    ? await BioPage.findOneAndUpdate(
        { workspace: req.activeWorkspace._id, 'items._id': itemId },
        { $pull: { items: { _id: itemId } }, $inc: { __v: 1 } }
      )
    : null;
  if (!updated) throw new NotFoundError('Item not found');

  res.status(200).json({ success: true, bioPage: await serializeBioPage(req.activeWorkspace._id) });
};

// GET /api/bio-pages/slug-availability?slug=... (public, rate limited)
export const checkSlugAvailability = async (req, res) => {
  const slug = normalizeSlug(req.query.slug);
  if (!isValidBioSlug(slug)) {
    return res.status(200).json({ success: true, slug, available: false, reason: 'invalid' });
  }

  const isTaken = Boolean(await BioPage.exists({ slug }));
  res.status(200).json({ success: true, slug, available: !isTaken, ...(isTaken && { reason: 'taken' }) });
};

/**
 * What anyone may see of a bio page: no owner, workspace, link ids or
 * counters. Only active items whose link is still active and still belongs
 * to the page's workspace are listed, each pointing at the link's own
 * short URL, so a click goes through the normal redirect and analytics
 * pipeline.
 * @returns {Promise<object | null>}
 */
async function findPublicBioPage(rawSlug) {
  const slug = normalizeSlug(rawSlug);
  if (!isValidBioSlug(slug)) return null;

  const page = await BioPage.findOne({ slug }).lean();
  if (!page) return null;

  const activeItems = page.items.filter((item) => item.active);
  const links = await Link.find({
    _id: { $in: activeItems.map((item) => item.linkId) },
    workspace: page.workspace,
    isActive: true,
  })
    .select('shortUrl')
    .lean();
  const shortUrlById = new Map(links.map((link) => [String(link._id), link.shortUrl]));

  const items = activeItems
    .filter((item) => shortUrlById.has(String(item.linkId)))
    .sort((a, b) => a.order - b.order || String(a._id).localeCompare(String(b._id)))
    .map((item) => ({
      id: String(item._id),
      label: item.label,
      icon: item.icon || null,
      shortUrl: shortUrlById.get(String(item.linkId)),
    }));

  return {
    _id: page._id,
    slug: page.slug,
    title: page.title || '',
    bio: page.bio || '',
    avatarUrl: page.avatarUrl || null,
    theme: page.theme,
    items,
  };
}

function toPublicJson({ _id, ...publicPage }) {
  return publicPage;
}

// GET /api/bio-pages/public/:slug (public)
export const getPublicBioPage = async (req, res) => {
  const page = await findPublicBioPage(req.params.slug);
  if (!page) throw new NotFoundError('Bio page not found');
  res.status(200).json({ success: true, bioPage: toPublicJson(page) });
};

/**
 * GET /b/:slug (public). The SPA shell with the page's title and link
 * preview tags in <head>, so platforms that don't run JavaScript still get
 * a real preview; visitors get the full React page from the same shell.
 */
export const renderPublicBioPage = async (req, res) => {
  const [page, shell] = await Promise.all([findPublicBioPage(req.params.slug), getSpaShell()]);

  if (page) {
    recordBioPageView(page._id).catch((err) => logger.error({ err, slug: page.slug }, 'Failed to count a bio page view'));
  }

  res
    .status(page ? 200 : 404)
    .set({ 'Content-Security-Policy': bioPageCsp(), 'Cache-Control': 'no-cache' })
    .type('html')
    .send(renderBioPageHtml(shell, page));
};

export default {
  getBioPage,
  createBioPage,
  updateBioPage,
  addBioPageItem,
  reorderBioPageItems,
  updateBioPageItem,
  removeBioPageItem,
  checkSlugAvailability,
  getPublicBioPage,
  renderPublicBioPage,
};
