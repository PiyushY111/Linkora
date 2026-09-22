import bcrypt from 'bcryptjs';
import Link from '../models/Link.js';
import Analytics from '../models/Analytics.js';
import ClickEvent from '../models/ClickEvent.js';
import { getClientIp, getUserAgent } from '../utils/helpers.js';
import { logger } from '../config/logger.js';
import {
  getLinkMeta,
  setLinkMeta,
  setNegativeCache,
  invalidateLinkMeta,
  incrementClickCounter,
} from '../services/cacheService.js';
import { emitClickEvent } from '../services/eventStreamService.js';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

/**
 * Verifies a link password against either a bcrypt hash or, for links not
 * yet migrated, the legacy plaintext value. On a successful plaintext match
 * it kicks off an async re-hash + cache invalidation (never awaited by the
 * caller) so the link is migrated to bcrypt on first successful use.
 */
function verifyLinkPassword(storedPassword, providedPwd, linkId, shortCode) {
  if (!providedPwd) return Promise.resolve(false);

  if (BCRYPT_HASH_PATTERN.test(storedPassword)) {
    return bcrypt.compare(providedPwd, storedPassword);
  }

  const matches = storedPassword === providedPwd;
  if (matches) {
    migrateLegacyPlaintextPassword(linkId, shortCode, providedPwd).catch((err) =>
      logger.error({ err, linkId }, 'Failed to migrate legacy plaintext link password')
    );
  }
  return Promise.resolve(matches);
}

async function migrateLegacyPlaintextPassword(linkId, shortCode, plaintext) {
  const hash = await bcrypt.hash(plaintext, 10);
  await Link.findByIdAndUpdate(linkId, { password: hash });
  await invalidateLinkMeta(shortCode);
}

/**
 * Redirects a short code to its destination URL.
 *
 * Hot path: Redis read-through cache only, zero synchronous MongoDB writes.
 * On a cache miss, MongoDB is read once (read preference "nearest") and the
 * cache is repopulated; on a Mongo miss a negative cache entry is written to
 * prevent cache penetration. The response is sent first; click-count and
 * click-event recording happen after, without being awaited.
 */
export const redirectLink = async (req, res) => {
  const shortCode = (req.params.shortCode || '').trim().toLowerCase();
  const { pwd } = req.query;

  if (!shortCode) {
    return res.status(404).json({ success: false, message: 'Link not found' });
  }

  const cached = await getLinkMeta(shortCode);

  if (cached.status === 'negative') {
    return res.status(404).json({ success: false, message: 'Link not found' });
  }

  let meta = cached.status === 'hit' ? cached.meta : null;

  if (!meta) {
    const link = await Link.findOne({
      $or: [{ shortCode }, { customAlias: shortCode }],
    })
      .read('nearest')
      .lean();

    if (!link) {
      setNegativeCache(shortCode).catch((err) => logger.error({ err, shortCode }, 'Failed to set negative cache'));
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    meta = {
      originalUrl: link.originalUrl,
      isActive: link.isActive,
      expiryDate: link.expiryDate ? new Date(link.expiryDate).getTime() : 0,
      passwordHash: link.password || '',
      linkId: String(link._id),
      userId: String(link.user),
    };

    setLinkMeta(shortCode, meta).catch((err) => logger.error({ err, shortCode }, 'Failed to populate link cache'));
  }

  if (!meta.isActive) {
    return res.status(410).json({ success: false, message: 'Link has been disabled' });
  }

  if (meta.expiryDate && Date.now() > meta.expiryDate) {
    return res.status(410).json({ success: false, message: 'Link has expired' });
  }

  if (meta.passwordHash) {
    const passwordOk = await verifyLinkPassword(meta.passwordHash, pwd, meta.linkId, shortCode);
    if (!passwordOk) {
      return res.status(403).json({ success: false, message: 'Invalid password' });
    }
  }

  res.set('Cache-Control', 'private, max-age=60');
  res.redirect(307, meta.originalUrl);

  // Fire-and-forget: never await Mongo writes or streaming on the hot path.
  incrementClickCounter(meta.linkId).catch((err) =>
    logger.error({ err, linkId: meta.linkId }, 'Failed to increment click counter')
  );
  emitClickEvent({
    linkId: meta.linkId,
    shortCode,
    userId: meta.userId,
    destinationUrl: meta.originalUrl,
    ip: getClientIp(req),
    ua: getUserAgent(req),
    referer: req.headers.referer || 'direct',
    timestamp: Date.now(),
    utmSource: req.query.utm_source,
    utmMedium: req.query.utm_medium,
    utmCampaign: req.query.utm_campaign,
  });
};

// Get analytics for a link
export const getLinkAnalytics = async (req, res) => {
  try {
    const { linkId } = req.params;

    const link = await Link.findById(linkId).read('secondaryPreferred');

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    if (link.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const analytics = await Analytics.findOne({ link: linkId }).read('secondaryPreferred');

    if (!analytics) {
      return res.status(404).json({ success: false, message: 'Analytics not found' });
    }

    const recentClicks = await ClickEvent.find({ link: linkId })
      .sort({ timestamp: -1 })
      .limit(100)
      .read('secondaryPreferred')
      .lean();

    res.status(200).json({
      success: true,
      analytics,
      recentClicks,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get analytics summary
export const getAnalyticsSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const links = await Link.find({ user: req.user.id }).read('secondaryPreferred').lean();
    const linkIds = links.map((l) => l._id);

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const matchStage = { link: { $in: linkIds } };
    if (Object.keys(dateFilter).length > 0) matchStage.timestamp = dateFilter;

    const [totals, byCountry, byDevice, byBrowser, byDay] = await Promise.all([
      ClickEvent.countDocuments(matchStage).read('secondaryPreferred'),
      ClickEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$country', clicks: { $sum: 1 } } },
        { $match: { _id: { $ne: null } } },
        { $sort: { clicks: -1 } },
        { $limit: 10 },
      ]).read('secondaryPreferred'),
      ClickEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$device', clicks: { $sum: 1 } } },
        { $match: { _id: { $ne: null } } },
      ]).read('secondaryPreferred'),
      ClickEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: '$browser', clicks: { $sum: 1 } } },
        { $match: { _id: { $ne: null } } },
        { $sort: { clicks: -1 } },
        { $limit: 10 },
      ]).read('secondaryPreferred'),
      ClickEvent.aggregate([
        { $match: matchStage },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, clicks: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).read('secondaryPreferred'),
    ]);

    res.status(200).json({
      success: true,
      summary: {
        totalClicks: totals,
        totalLinks: links.length,
        topCountries: byCountry.map((c) => ({ country: c._id, clicks: c.clicks })),
        topDevices: byDevice.map((d) => ({ device: d._id, clicks: d.clicks })),
        topBrowsers: byBrowser.map((b) => ({ browser: b._id, clicks: b.clicks })),
        clicksByDay: byDay.map((d) => ({ day: d._id, clicks: d.clicks })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
