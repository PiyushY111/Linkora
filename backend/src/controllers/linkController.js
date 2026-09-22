import Link from '../models/Link.js';
import Analytics from '../models/Analytics.js';
import User from '../models/User.js';
import { validateUrl, getClientIp } from '../utils/helpers.js';
import { generateQRCode } from '../utils/qrcode.js';
import { generateSequencedShortCode } from '../utils/sequenceGenerator.js';
import { invalidateLinkMeta } from '../services/cacheService.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { logAudit } from '../utils/auditLogger.js';
import { checkUrlThreat } from '../services/threatDetectionService.js';
import { dispatchEvent } from '../services/webhookService.js';

/**
 * Core link-creation logic, shared by the single-create route and the
 * public API's bulk-create endpoint. Does not touch req/res so it can be
 * called in parallel for a batch. Assumes URL scheme/SSRF validation has
 * already happened (route-level middleware for the single-create path,
 * per-URL in the bulk path).
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
  } = payload;

  if (!validateUrl(originalUrl)) {
    return { success: false, status: 400, message: 'Invalid URL' };
  }

  const threat = await checkUrlThreat(originalUrl);
  if (threat.malicious) {
    return { success: false, status: 400, message: 'URL flagged as malicious and cannot be shortened' };
  }

  // Distributed sequence generator: zero database checks before insert. A
  // user-supplied customAlias is used directly and relies on the unique
  // index (caught below) instead of a pre-check find-then-create race.
  const shortCode = customAlias || (await generateSequencedShortCode());
  const shortUrl = `${env.FRONTEND_URL}/${shortCode}`;

  let link;
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
      ...(utm && typeof utm === 'object' ? { utm } : {}),
      ...(initialQrCode ? { qrCode: initialQrCode } : {}),
      ...(initialQrConfig ? { qrConfig: initialQrConfig } : {}),
    });
  } catch (createError) {
    if (createError.code === 11000) {
      return { success: false, status: 400, message: 'Short code or custom alias already exists' };
    }
    throw createError;
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

  return { success: true, status: 201, link };
}

// Create short link
export const createLink = async (req, res) => {
  try {
    const result = await createLinkRecord(req.user.id, req.body);
    if (!result.success) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    logAudit({
      action: 'link.create',
      actorUserId: req.user.id,
      targetResourceId: String(result.link._id),
      ipAddress: getClientIp(req),
      diff: { shortCode: result.link.shortCode, originalUrl: result.link.originalUrl },
    });

    dispatchEvent(req.user.id, 'link.created', {
      linkId: String(result.link._id),
      shortCode: result.link.shortCode,
      originalUrl: result.link.originalUrl,
      title: result.link.title || '',
      createdAt: result.link.createdAt,
    }).catch((err) => logger.error({ err }, 'Failed to dispatch link.created webhook'));

    res.status(201).json({ success: true, link: result.link });
  } catch (error) {
    logger.error({ err: error }, 'Error in createLink');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get user's links with optional filtering, search, and sorting
export const getUserLinks = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single link
export const getLink = async (req, res) => {
  try {
    const link = await Link.findById(req.params.id).populate('analytics user').read('secondaryPreferred');

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    // Check if user owns the link
    if (link.user._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.status(200).json({
      success: true,
      link,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update link
export const updateLink = async (req, res) => {
  try {
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
    } = req.body;

    let link = await Link.findById(req.params.id);

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    // Check if user owns the link
    if (link.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updateFields = {};

    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (tags !== undefined) updateFields.tags = tags;
    if (category !== undefined) updateFields.category = category;

    if (originalUrl && originalUrl.trim() && originalUrl.trim() !== link.originalUrl) {
      const trimmedUrl = originalUrl.trim();
      if (!validateUrl(trimmedUrl)) {
        return res.status(400).json({ success: false, message: 'Invalid destination URL format' });
      }
      const threat = await checkUrlThreat(trimmedUrl);
      if (threat.malicious) {
        return res.status(400).json({ success: false, message: 'URL flagged as malicious' });
      }
      updateFields.originalUrl = trimmedUrl;
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

    link = await Link.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );

    await invalidateLinkMeta(link.shortCode);
    if (link.customAlias) await invalidateLinkMeta(link.customAlias);

    logAudit({
      action: 'link.update',
      actorUserId: req.user.id,
      targetResourceId: req.params.id,
      ipAddress: getClientIp(req),
      diff: { title, description, tags, category, expiryDate },
    });

    dispatchEvent(req.user.id, 'link.updated', {
      linkId: String(link._id),
      shortCode: link.shortCode,
      originalUrl: link.originalUrl,
      title: link.title || '',
      updatedAt: link.updatedAt,
    }).catch((err) => logger.error({ err }, 'Failed to dispatch link.updated webhook'));

    res.status(200).json({
      success: true,
      link,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete link
export const deleteLink = async (req, res) => {
  try {
    const link = await Link.findById(req.params.id);

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    // Check if user owns the link
    if (link.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await Link.findByIdAndDelete(req.params.id);

    // Delete associated analytics
    await Analytics.findByIdAndDelete(link.analytics);

    // Remove from user's links array
    await req.user.updateOne({ $pull: { links: req.params.id } });

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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Disable/Enable link
export const toggleLinkStatus = async (req, res) => {
  try {
    const link = await Link.findById(req.params.id);

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    if (link.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
