import bcrypt from 'bcryptjs';
import Link from '../models/Link.js';
import Analytics from '../models/Analytics.js';
import User from '../models/User.js';
import { getClientIp } from '../utils/helpers.js';
import { generateQRCode } from '../utils/qrcode.js';
import { generateSequencedShortCode } from '../utils/sequenceGenerator.js';
import { invalidateLinkMeta } from '../services/cacheService.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { logAudit } from '../utils/auditLogger.js';
import { dispatchEvent } from '../services/webhookService.js';
import { validateLinkRedirectFields } from '../services/linkUrlValidation.js';
import { isReservedAlias } from '../lib/reservedAliases.js';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors.js';

const ALIAS_PATTERN = /^[a-z0-9-]+$/;

/**
 * Validates a user-supplied customAlias: charset, not a route-shadowing
 * reserved word, and not already claimed by another link's shortCode OR
 * customAlias (the redirect route resolves by `$or` across both fields, so
 * a collision on either side is a live hijack of someone else's link).
 */
async function assertAliasAvailable(customAlias) {
  if (!ALIAS_PATTERN.test(customAlias)) {
    throw new ValidationError('Custom alias can only contain lowercase letters, numbers, and hyphens');
  }
  if (isReservedAlias(customAlias)) {
    throw new ValidationError('This alias is reserved and cannot be used');
  }
  const collision = await Link.findOne({ $or: [{ shortCode: customAlias }, { customAlias } ] })
    .select('_id')
    .lean();
  if (collision) {
    throw new ConflictError('This alias is already in use');
  }
}

/**
 * Core link-creation logic, shared by the single-create route and the
 * public API's bulk-create endpoint. Does not touch req/res so it can be
 * called in parallel for a batch.
 * @param {string} userId
 * @param {{ originalUrl: string, customAlias?: string, title?: string, description?: string, tags?: string[], category?: string, expiryDate?: string, password?: string }} payload
 * @param {{ generateQr?: boolean }} [options]
 */
export async function createLinkRecord(userId, payload, { generateQr = true } = {}) {
  const {
    originalUrl,
    customAlias,
    title,
    description,
    tags,
    category,
    expiryDate,
    password,
    maxClicks,
    iosRedirect,
    androidRedirect,
    expiredRedirectUrl,
    utm,
    qrCode: initialQrCode,
    qrConfig: initialQrConfig,
    routingType,
    variants,
    ogTitle,
    ogDescription,
    ogImage,
  } = payload;

  // Every field that can send a visitor somewhere — the primary
  // destination, both device-specific redirects, the expired-link
  // fallback, and every A/B variant — gets the same SSRF + threat-intel
  // check, on both create and update.
  await validateLinkRedirectFields(payload);

  if (customAlias) {
    await assertAliasAvailable(customAlias);
  }

  // Distributed sequence generator: zero database checks before insert for
  // the auto-generated path. A user-supplied customAlias is checked above
  // (reserved words + cross-field collision); the retry loop below is
  // defense in depth for the auto-generated path only — a customAlias
  // collision is a real conflict, not generator noise, so it fails fast.
  const MAX_CREATE_ATTEMPTS = 3;
  let shortCode = customAlias || (await generateSequencedShortCode());
  let link;

  for (let attempt = 1; ; attempt += 1) {
    const shortUrl = `${env.FRONTEND_URL}/${shortCode}`;
    try {
      link = await Link.create({
        originalUrl,
        shortCode,
        shortUrl,
        // Omitted (not null) when absent: the sparse unique index on
        // customAlias only excludes missing fields, not explicit nulls, so
        // writing null here would collide across every alias-less link.
        ...(customAlias ? { customAlias } : {}),
        user: userId,
        title,
        description,
        tags,
        category,
        expiryDate,
        password,
        maxClicks: Number(maxClicks) > 0 ? parseInt(maxClicks, 10) : null,
        iosRedirect: iosRedirect ? iosRedirect.trim() : null,
        androidRedirect: androidRedirect ? androidRedirect.trim() : null,
        expiredRedirectUrl: expiredRedirectUrl ? expiredRedirectUrl.trim() : null,
        routingType: routingType === 'ab_test' ? 'ab_test' : 'direct',
        variants: Array.isArray(variants)
          ? variants.map((v, i) => ({
              id: v.id || `var_${String.fromCharCode(97 + i)}_${Date.now()}`,
              name: v.name || `Variant ${String.fromCharCode(65 + i)}`,
              url: v.url,
              weight: Number(v.weight) || 50,
              clicks: v.clicks || 0,
            }))
          : [],
        ogTitle: ogTitle ? ogTitle.trim() : null,
        ogDescription: ogDescription ? ogDescription.trim() : null,
        ogImage: ogImage ? ogImage.trim() : null,
        ...(utm && typeof utm === 'object' ? { utm } : {}),
        ...(initialQrCode ? { qrCode: initialQrCode } : {}),
        ...(initialQrConfig ? { qrConfig: initialQrConfig } : {}),
      });
      break;
    } catch (createError) {
      if (createError.code !== 11000) {
        throw createError;
      }
      if (customAlias || attempt >= MAX_CREATE_ATTEMPTS) {
        throw new ConflictError('Short code or custom alias already exists');
      }
      logger.warn({ shortCode, attempt }, 'Short code collision on insert; generating a fresh code and retrying');
      shortCode = await generateSequencedShortCode();
    }
  }

  await Analytics.create({ link: link._id, user: userId });

  if (generateQr && !link.qrCode) {
    try {
      const qrCode = await generateQRCode(link.shortUrl);
      link.qrCode = qrCode;
      await link.save();
    } catch (qrError) {
      logger.error({ err: qrError }, 'QR code generation failed');
      // Continue without QR code
    }
  }

  await User.findByIdAndUpdate(userId, { $push: { links: link._id } });

  return link;
}

// Create short link
export const createLink = async (req, res) => {
  const link = await createLinkRecord(req.user.id, req.body);

  logAudit({
    action: 'link.create',
    actorUserId: req.user.id,
    targetResourceId: String(link._id),
    ipAddress: getClientIp(req),
    diff: { shortCode: link.shortCode, originalUrl: link.originalUrl },
  });

  dispatchEvent(req.user.id, 'link.created', {
    linkId: String(link._id),
    shortCode: link.shortCode,
    originalUrl: link.originalUrl,
    title: link.title || '',
    createdAt: link.createdAt,
  }).catch((err) => logger.error({ err }, 'Failed to dispatch link.created webhook'));

  res.status(201).json({ success: true, link });
};

// Get user's links with optional filtering, search, and sorting
export const getUserLinks = async (req, res) => {
  const { page = 1, limit = 50, sort = '-createdAt', search, status, category, tag } = req.query;

  const query = { user: req.user.id };

  if (search && search.trim()) {
    const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(sanitized, 'i');
    query.$or = [
      { title: regex },
      { shortCode: regex },
      { customAlias: regex },
      { originalUrl: regex },
    ];
  }

  if (status === 'active') {
    query.isActive = true;
  } else if (status === 'disabled') {
    query.isActive = false;
  } else if (status === 'flagged') {
    query.abuseFlag = true;
  }

  if (category && category !== 'all') {
    query.category = category;
  }

  if (tag && tag.trim()) {
    query.tags = tag.trim();
  }

  const links = await Link.find(query)
    .sort(sort)
    .limit(Math.min(parseInt(limit, 10) || 50, 100))
    .skip((Math.max(parseInt(page, 10) || 1, 1) - 1) * (parseInt(limit, 10) || 50))
    .populate('analytics')
    .read('secondaryPreferred');

  const totalCount = await Link.countDocuments(query).read('secondaryPreferred');

  res.status(200).json({
    success: true,
    links,
    pagination: {
      totalCount,
      page: parseInt(page, 10),
      pages: Math.ceil(totalCount / (parseInt(limit, 10) || 50)),
    },
  });
};

// Get single link. Ownership is enforced in the query itself
// (findOne({ _id, user })) rather than fetched-then-compared, so a
// not-owned resource is indistinguishable from a nonexistent one.
export const getLink = async (req, res) => {
  const link = await Link.findOne({ _id: req.params.id, user: req.user.id })
    .populate('analytics user')
    .read('secondaryPreferred');

  if (!link) {
    throw new NotFoundError('Link not found');
  }

  res.status(200).json({
    success: true,
    link,
  });
};

// Update link
export const updateLink = async (req, res) => {
  const {
    originalUrl,
    title,
    description,
    tags,
    category,
    expiryDate,
    removeExpiryDate,
    password,
    removePassword,
    maxClicks,
    removeMaxClicks,
    iosRedirect,
    removeIosRedirect,
    androidRedirect,
    removeAndroidRedirect,
    expiredRedirectUrl,
    removeExpiredRedirectUrl,
    utm,
    qrCode,
    qrConfig,
    routingType,
    variants,
    ogTitle,
    ogDescription,
    ogImage,
  } = req.body;

  const link = await Link.findOne({ _id: req.params.id, user: req.user.id });
  if (!link) {
    throw new NotFoundError('Link not found');
  }

  // Validate every redirect-capable field being changed with the same
  // SSRF + threat-intel check used at creation time. Unlike creation, only
  // fields actually present in this request are checked (partial updates).
  await validateLinkRedirectFields({
    originalUrl: originalUrl && originalUrl.trim() !== link.originalUrl ? originalUrl.trim() : undefined,
    iosRedirect,
    androidRedirect,
    expiredRedirectUrl,
    variants,
  });

  const updateFields = {};

  if (title !== undefined) updateFields.title = title;
  if (description !== undefined) updateFields.description = description;
  if (tags !== undefined) updateFields.tags = tags;
  if (category !== undefined) updateFields.category = category;
  if (routingType !== undefined) updateFields.routingType = routingType;
  if (variants !== undefined && Array.isArray(variants)) {
    updateFields.variants = variants.map((v, i) => ({
      id: v.id || `var_${String.fromCharCode(97 + i)}_${Date.now()}`,
      name: v.name || `Variant ${String.fromCharCode(65 + i)}`,
      url: v.url,
      weight: Number(v.weight) || 50,
      clicks: v.clicks || 0,
    }));
  }
  if (ogTitle !== undefined) updateFields.ogTitle = ogTitle;
  if (ogDescription !== undefined) updateFields.ogDescription = ogDescription;
  if (ogImage !== undefined) updateFields.ogImage = ogImage;

  if (originalUrl && originalUrl.trim() && originalUrl.trim() !== link.originalUrl) {
    updateFields.originalUrl = originalUrl.trim();
  }

  if (removeExpiryDate) {
    updateFields.expiryDate = null;
  } else if (expiryDate) {
    updateFields.expiryDate = new Date(expiryDate);
  }

  if (removePassword) {
    updateFields.password = null;
  } else if (typeof password === 'string' && password.trim().length > 0) {
    updateFields.password = await bcrypt.hash(password.trim(), 10);
  }

  if (removeMaxClicks) {
    updateFields.maxClicks = null;
  } else if (maxClicks !== undefined) {
    updateFields.maxClicks = Number(maxClicks) > 0 ? parseInt(maxClicks, 10) : null;
  }

  if (removeIosRedirect) {
    updateFields.iosRedirect = null;
  } else if (iosRedirect !== undefined) {
    updateFields.iosRedirect = iosRedirect && iosRedirect.trim() ? iosRedirect.trim() : null;
  }

  if (removeAndroidRedirect) {
    updateFields.androidRedirect = null;
  } else if (androidRedirect !== undefined) {
    updateFields.androidRedirect = androidRedirect && androidRedirect.trim() ? androidRedirect.trim() : null;
  }

  if (removeExpiredRedirectUrl) {
    updateFields.expiredRedirectUrl = null;
  } else if (expiredRedirectUrl !== undefined) {
    updateFields.expiredRedirectUrl = expiredRedirectUrl && expiredRedirectUrl.trim() ? expiredRedirectUrl.trim() : null;
  }

  if (utm && typeof utm === 'object') {
    updateFields.utm = utm;
  }

  if (qrCode !== undefined) updateFields.qrCode = qrCode;
  if (qrConfig !== undefined) updateFields.qrConfig = qrConfig;

  const updated = await Link.findByIdAndUpdate(link._id, updateFields, { new: true, runValidators: true });

  await invalidateLinkMeta(updated.shortCode);
  if (updated.customAlias) await invalidateLinkMeta(updated.customAlias);

  logAudit({
    action: 'link.update',
    actorUserId: req.user.id,
    targetResourceId: req.params.id,
    ipAddress: getClientIp(req),
    diff: { title, description, tags, category, expiryDate },
  });

  dispatchEvent(req.user.id, 'link.updated', {
    linkId: String(updated._id),
    shortCode: updated.shortCode,
    originalUrl: updated.originalUrl,
    title: updated.title || '',
    updatedAt: updated.updatedAt,
  }).catch((err) => logger.error({ err }, 'Failed to dispatch link.updated webhook'));

  res.status(200).json({
    success: true,
    link: updated,
  });
};

// Delete link
export const deleteLink = async (req, res) => {
  const link = await Link.findOne({ _id: req.params.id, user: req.user.id });
  if (!link) {
    throw new NotFoundError('Link not found');
  }

  await Link.findByIdAndDelete(link._id);

  // Delete associated analytics
  await Analytics.findByIdAndDelete(link.analytics);

  // Remove from user's links array
  await req.user.updateOne({ $pull: { links: link._id } });

  await invalidateLinkMeta(link.shortCode);
  if (link.customAlias) await invalidateLinkMeta(link.customAlias);

  logAudit({
    action: 'link.delete',
    actorUserId: req.user.id,
    targetResourceId: req.params.id,
    ipAddress: getClientIp(req),
    diff: { shortCode: link.shortCode },
  });

  dispatchEvent(req.user.id, 'link.deleted', {
    linkId: String(link._id),
    shortCode: link.shortCode,
    originalUrl: link.originalUrl,
    deletedAt: new Date().toISOString(),
  }).catch((err) => logger.error({ err }, 'Failed to dispatch link.deleted webhook'));

  res.status(200).json({
    success: true,
    message: 'Link deleted successfully',
  });
};

// Disable/Enable link
export const toggleLinkStatus = async (req, res) => {
  const link = await Link.findOne({ _id: req.params.id, user: req.user.id });
  if (!link) {
    throw new NotFoundError('Link not found');
  }

  link.isActive = !link.isActive;
  await link.save();

  await invalidateLinkMeta(link.shortCode);
  if (link.customAlias) await invalidateLinkMeta(link.customAlias);

  logAudit({
    action: 'link.toggle_status',
    actorUserId: req.user.id,
    targetResourceId: req.params.id,
    ipAddress: getClientIp(req),
    diff: { isActive: link.isActive },
  });

  res.status(200).json({
    success: true,
    link,
  });
};
