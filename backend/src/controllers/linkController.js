import Link from '../models/Link.js';
import Analytics from '../models/Analytics.js';
import { validateUrl } from '../utils/helpers.js';
import { generateQRCode } from '../utils/qrcode.js';
import { generateSequencedShortCode } from '../utils/sequenceGenerator.js';
import { invalidateLinkMeta } from '../services/cacheService.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// Create short link
export const createLink = async (req, res) => {
  try {
    const { originalUrl, customAlias, title, description, tags, category, expiryDate, password } = req.body;

    // Validate URL
    if (!validateUrl(originalUrl)) {
      return res.status(400).json({ success: false, message: 'Invalid URL' });
    }

    // Distributed sequence generator: zero database checks before insert.
    // A user-supplied customAlias is used directly and relies on the unique
    // index (caught below) instead of a pre-check find-then-create race.
    const shortCode = customAlias || (await generateSequencedShortCode());
    const shortUrl = `${env.FRONTEND_URL}/${shortCode}`;

    let link;
    try {
      link = await Link.create({
        originalUrl,
        shortCode,
        shortUrl,
        customAlias: customAlias || null,
        user: req.user.id,
        title,
        description,
        tags,
        category,
        expiryDate,
        password,
      });
    } catch (createError) {
      if (createError.code === 11000) {
        return res.status(400).json({ success: false, message: 'Short code or custom alias already exists' });
      }
      throw createError;
    }

    // Create analytics record
    await Analytics.create({
      link: link._id,
      user: req.user.id,
    });

    // Generate QR code
    try {
      const qrCode = await generateQRCode(link.shortUrl);
      link.qrCode = qrCode;
      await link.save();
    } catch (qrError) {
      logger.error({ err: qrError }, 'QR code generation failed');
      // Continue without QR code
    }

    // Update user's links array
    await req.user.updateOne({ $push: { links: link._id } });

    res.status(201).json({
      success: true,
      link,
    });
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
      .populate('analytics');

    const totalCount = await Link.countDocuments({ user: req.user.id });

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
    const link = await Link.findById(req.params.id).populate('analytics user');

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

    res.status(200).json({
      success: true,
      link,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
