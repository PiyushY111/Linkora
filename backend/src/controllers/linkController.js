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
  const { originalUrl, customAlias, title, description, tags, category, expiryDate, password } = payload;

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
    });
  } catch (createError) {
    if (createError.code === 11000) {
      return { success: false, status: 400, message: 'Short code or custom alias already exists' };
    }
    throw createError;
  }

  await Analytics.create({ link: link._id, user: userId });

  if (generateQr) {
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

    res.status(201).json({ success: true, link: result.link });
  } catch (error) {
    logger.error({ err: error }, 'Error in createLink');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get user's links
export const getUserLinks = async (req, res) => {
  try {
    const { page = 1, limit = 10, sort = '-createdAt' } = req.query;

    const links = await Link.find({ user: req.user.id })
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('analytics')
      .read('secondaryPreferred');

    const totalCount = await Link.countDocuments({ user: req.user.id }).read('secondaryPreferred');

    res.status(200).json({
      success: true,
      links,
      pagination: {
        totalCount,
        page: parseInt(page),
        pages: Math.ceil(totalCount / limit),
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
    const { title, description, tags, category, expiryDate } = req.body;

    let link = await Link.findById(req.params.id);

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    // Check if user owns the link
    if (link.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    link = await Link.findByIdAndUpdate(
      req.params.id,
      { title, description, tags, category, expiryDate },
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
