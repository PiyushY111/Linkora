import Link from '../models/Link.js';
import { createLinkRecord } from './linkController.js';
import { getLinkAnalytics as fetchLinkAnalytics } from './analyticsController.js';
import { validateUrlSafety } from '../middleware/ssrfValidator.js';
import { validateUrl, getClientIp } from '../utils/helpers.js';
import { logAudit } from '../utils/auditLogger.js';
import { redis, invalidateLinkMeta } from '../services/cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const MAX_BULK_SIZE = 1000;
const VALIDATION_CONCURRENCY = 50;

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * Helper to resolve link by shortCode or Mongo ID owned by the user.
 */
async function findUserLink(codeOrId, userId) {
  const query = {
    user: userId,
    $or: [{ shortCode: codeOrId }],
  };
  if (codeOrId.match(/^[0-9a-fA-F]{24}$/)) {
    query.$or.push({ _id: codeOrId });
  }
  return await Link.findOne(query);
}

/**
 * GET /api/public/v1/links
 * List paginated links with search, tag filtering, and sorting.
 */
export const listLinks = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, tag, sort = 'createdAt_desc' } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const query = { user: req.user.id };

    if (search && search.trim()) {
      query.$or = [
        { shortCode: { $regex: search.trim(), $options: 'i' } },
        { originalUrl: { $regex: search.trim(), $options: 'i' } },
        { title: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    if (tag && tag.trim()) {
      query.tags = tag.trim();
    }

    const sortOptions = {};
    if (sort === 'clicks_desc') sortOptions.clicks = -1;
    else if (sort === 'clicks_asc') sortOptions.clicks = 1;
    else if (sort === 'createdAt_asc') sortOptions.createdAt = 1;
    else sortOptions.createdAt = -1;

    const [links, total] = await Promise.all([
      Link.find(query)
        .select('-password -__v')
        .sort(sortOptions)
        .limit(parsedLimit)
        .skip((parsedPage - 1) * parsedLimit)
        .lean(),
      Link.countDocuments(query),
    ]);

    const formattedLinks = links.map((link) => ({
      id: link._id,
      shortCode: link.shortCode,
      shortUrl: `${env.FRONTEND_URL}/${link.shortCode}`,
      originalUrl: link.originalUrl,
      title: link.title,
      description: link.description,
      tags: link.tags,
      clicks: link.clicks,
      uniqueVisitors: link.uniqueVisitors,
      isActive: link.isActive,
      expiryDate: link.expiryDate,
      maxClicks: link.maxClicks,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    }));

    res.status(200).json({
      success: true,
      links: formattedLinks,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in publicApi listLinks');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/public/v1/links
 * Create a single enterprise link via Public API.
 */
export const createLink = async (req, res) => {
  try {
    const { originalUrl } = req.body;

    if (!originalUrl) {
      return res.status(400).json({ success: false, message: 'originalUrl is required' });
    }

    if (!validateUrl(originalUrl)) {
      return res.status(400).json({ success: false, message: 'Invalid URL format' });
    }

    const safety = await validateUrlSafety(originalUrl);
    if (!safety.safe) {
      return res.status(400).json({ success: false, message: `URL rejected: ${safety.reason}` });
    }

    const created = await createLinkRecord(req.user.id, req.body, { generateQr: true });
    if (!created.success) {
      return res.status(created.status || 400).json({ success: false, message: created.message });
    }

    logAudit({
      action: 'api.link.create',
      actorUserId: req.user.id,
      ipAddress: getClientIp(req),
      targetResourceId: String(created.link._id),
      diff: { shortCode: created.link.shortCode, originalUrl },
    });

    const linkData = {
      id: created.link._id,
      shortCode: created.link.shortCode,
      shortUrl: `${env.FRONTEND_URL}/${created.link.shortCode}`,
      originalUrl: created.link.originalUrl,
      title: created.link.title,
      description: created.link.description,
      tags: created.link.tags,
      qrCode: created.link.qrCode,
      maxClicks: created.link.maxClicks,
      expiryDate: created.link.expiryDate,
      isActive: created.link.isActive,
      createdAt: created.link.createdAt,
    };

    res.status(201).json({ success: true, link: linkData });
  } catch (error) {
    logger.error({ err: error }, 'Error in publicApi createLink');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/public/v1/links/:code
 * Retrieve link metadata by shortCode or ID.
 */
export const getLink = async (req, res) => {
  try {
    const link = await findUserLink(req.params.code, req.user.id);
    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    res.status(200).json({
      success: true,
      link: {
        id: link._id,
        shortCode: link.shortCode,
        shortUrl: `${env.FRONTEND_URL}/${link.shortCode}`,
        originalUrl: link.originalUrl,
        title: link.title,
        description: link.description,
        tags: link.tags,
        clicks: link.clicks,
        uniqueVisitors: link.uniqueVisitors,
        isActive: link.isActive,
        expiryDate: link.expiryDate,
        maxClicks: link.maxClicks,
        qrCode: link.qrCode,
        iosRedirect: link.iosRedirect,
        androidRedirect: link.androidRedirect,
        utm: link.utm,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in publicApi getLink');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/public/v1/links/:code
 * Update destination URL or metadata for a link.
 */
export const updateLink = async (req, res) => {
  try {
    const link = await findUserLink(req.params.code, req.user.id);
    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    const {
      originalUrl,
      title,
      description,
      tags,
      expiryDate,
      maxClicks,
      isActive,
      iosRedirect,
      androidRedirect,
      utm,
    } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (tags !== undefined) updates.tags = tags;
    if (expiryDate !== undefined) updates.expiryDate = expiryDate;
    if (maxClicks !== undefined) updates.maxClicks = maxClicks;
    if (isActive !== undefined) updates.isActive = isActive;
    if (iosRedirect !== undefined) updates.iosRedirect = iosRedirect;
    if (androidRedirect !== undefined) updates.androidRedirect = androidRedirect;
    if (utm !== undefined) updates.utm = utm;

    if (originalUrl && originalUrl.trim() !== link.originalUrl) {
      if (!validateUrl(originalUrl)) {
        return res.status(400).json({ success: false, message: 'Invalid URL format' });
      }
      const safety = await validateUrlSafety(originalUrl);
      if (!safety.safe) {
        return res.status(400).json({ success: false, message: `URL rejected: ${safety.reason}` });
      }
      updates.originalUrl = originalUrl.trim();
    }

    const updated = await Link.findByIdAndUpdate(link._id, updates, { new: true }).select('-password');

    // Invalidate Redis redirect cache
    await redis.del(`link:${link.shortCode}`);

    logAudit({
      action: 'api.link.update',
      actorUserId: req.user.id,
      ipAddress: getClientIp(req),
      targetResourceId: String(link._id),
      diff: updates,
    });

    res.status(200).json({
      success: true,
      link: {
        id: updated._id,
        shortCode: updated.shortCode,
        shortUrl: `${env.FRONTEND_URL}/${updated.shortCode}`,
        originalUrl: updated.originalUrl,
        title: updated.title,
        description: updated.description,
        tags: updated.tags,
        clicks: updated.clicks,
        isActive: updated.isActive,
        expiryDate: updated.expiryDate,
        maxClicks: updated.maxClicks,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in publicApi updateLink');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/public/v1/links/:code
 * Delete short link.
 */
export const deleteLink = async (req, res) => {
  try {
    const link = await findUserLink(req.params.code, req.user.id);
    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    await Link.findByIdAndDelete(link._id);
    await redis.del(`link:${link.shortCode}`);

    logAudit({
      action: 'api.link.delete',
      actorUserId: req.user.id,
      ipAddress: getClientIp(req),
      targetResourceId: String(link._id),
    });

    res.status(200).json({ success: true, message: `Link '${link.shortCode}' deleted successfully` });
  } catch (error) {
    logger.error({ err: error }, 'Error in publicApi deleteLink');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/public/v1/links/:code/analytics
 * Retrieve analytics metrics for a specific link.
 */
export const getLinkAnalytics = async (req, res) => {
  try {
    const link = await findUserLink(req.params.code, req.user.id);
    if (!link) {
      return res.status(404).json({ success: false, message: 'Link not found' });
    }

    // Set params for analyticsController reuse
    req.params.linkId = String(link._id);
    return fetchLinkAnalytics(req, res);
  } catch (error) {
    logger.error({ err: error }, 'Error in publicApi getLinkAnalytics');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/public/v1/links/bulk
 * Bulk shorten up to 1,000 links in parallel.
 */
export const bulkCreateLinks = async (req, res) => {
  const { links } = req.body;

  if (!Array.isArray(links) || links.length === 0) {
    return res.status(400).json({ success: false, message: 'links must be a non-empty array' });
  }
  if (links.length > MAX_BULK_SIZE) {
    return res.status(400).json({ success: false, message: `links cannot exceed ${MAX_BULK_SIZE} entries per batch` });
  }

  const results = await mapWithConcurrency(links, VALIDATION_CONCURRENCY, async (item) => {
    const originalUrl = typeof item === 'string' ? item : item.originalUrl;

    const safety = await validateUrlSafety(originalUrl);
    if (!safety.safe) {
      return { originalUrl, success: false, message: `URL rejected: ${safety.reason}` };
    }

    try {
      const payload = typeof item === 'string' ? { originalUrl } : item;
      const created = await createLinkRecord(req.user.id, payload, { generateQr: false });
      if (!created.success) {
        return { originalUrl, success: false, message: created.message };
      }
      return {
        originalUrl,
        success: true,
        shortCode: created.link.shortCode,
        shortUrl: `${env.FRONTEND_URL}/${created.link.shortCode}`,
      };
    } catch (err) {
      return { originalUrl, success: false, message: err.message };
    }
  });

  const succeeded = results.filter((r) => r.success).length;

  logAudit({
    action: 'api.link.bulk_create',
    actorUserId: req.user.id,
    ipAddress: getClientIp(req),
    diff: { requested: links.length, succeeded },
  });

  res.status(200).json({
    success: true,
    total: links.length,
    succeeded,
    failed: links.length - succeeded,
    results,
  });
};

/**
 * GET /api/public/v1/usage
 * Telemetry endpoint returning rate limit and quota information.
 */
export const getUsage = async (req, res) => {
  const capacity = req.apiKeyDoc?.rateLimit?.capacity || 20;
  const refillRate = req.apiKeyDoc?.rateLimit?.refillPerSecond || 5;

  res.status(200).json({
    success: true,
    key: {
      name: req.apiKeyDoc?.name || 'Primary Key',
      prefix: req.apiKeyDoc?.prefix || 'legacy',
      environment: req.apiKeyDoc?.environment || 'live',
      scopes: req.scopes || ['*'],
      totalRequests: req.apiKeyDoc?.totalRequests || 0,
      lastUsedAt: req.apiKeyDoc?.lastUsedAt || null,
    },
    rateLimits: {
      algorithm: 'token-bucket',
      burstCapacity: capacity,
      refillPerSecond: refillRate,
      standardWindow: '1 second',
    },
  });
};

/**
 * GET /api/public/v1/openapi.json
 * Official OpenAPI 3.1.0 specification.
 */
export const getOpenApiSpec = (req, res) => {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Linkora Public REST API',
      version: '1.0.0',
      description: 'Enterprise API for short link creation, management, analytics, and bulk provisioning.',
      contact: { name: 'Linkora Developer Support', email: 'support@linkora.dev' },
    },
    servers: [{ url: `${env.FRONTEND_URL}/api/public/v1`, description: 'Current Environment API Server' }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Pass your API Key via the x-api-key header.',
        },
      },
    },
    paths: {
      '/links': {
        get: {
          summary: 'List user links',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'tag', in: 'query', schema: { type: 'string' } },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: ['createdAt_desc', 'clicks_desc'] } },
          ],
          responses: { 200: { description: 'Paginated links' } },
        },
        post: {
          summary: 'Create a new short link',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['originalUrl'],
                  properties: {
                    originalUrl: { type: 'string', format: 'uri' },
                    customAlias: { type: 'string' },
                    title: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    password: { type: 'string' },
                    expiryDate: { type: 'string', format: 'date-time' },
                    maxClicks: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Link created' } },
        },
      },
      '/links/{code}': {
        get: { summary: 'Get link details by code or ID' },
        patch: { summary: 'Update link settings' },
        delete: { summary: 'Delete link' },
      },
      '/links/{code}/analytics': {
        get: { summary: 'Get aggregate click analytics for a link' },
      },
      '/links/bulk': {
        post: { summary: 'Bulk create up to 1,000 links' },
      },
      '/usage': {
        get: { summary: 'Retrieve API rate limits and quota status' },
      },
    },
  };

  res.status(200).json(spec);
};

export default {
  listLinks,
  createLink,
  getLink,
  updateLink,
  deleteLink,
  getLinkAnalytics,
  bulkCreateLinks,
  getUsage,
  getOpenApiSpec,
};
