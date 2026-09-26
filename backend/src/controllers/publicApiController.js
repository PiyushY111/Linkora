import Link from '../models/Link.js';
import ApiLog from '../models/ApiLog.js';
import { createLinkRecord } from './linkController.js';
import { getLinkAnalytics as fetchLinkAnalytics } from './analyticsController.js';
import { validateLinkRedirectFields } from '../services/linkUrlValidation.js';
import { getClientIp } from '../utils/helpers.js';
import { logAudit } from '../utils/auditLogger.js';
import { invalidateLinkMeta } from '../services/cacheService.js';
import { getAnalyticsRepository } from '../repositories/analytics/analyticsRepository.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { PUBLIC_API_TOKEN_BUCKET, peekTokenBucket, tokenBucketKey } from '../middleware/rateLimiter.js';
import { ValidationError, NotFoundError, toClientError } from '../lib/errors.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

const MAX_BULK_SIZE = 1000;
const DEFAULT_HISTORY_DAYS = 7;
// ApiLog documents expire after 30 days, so there is nothing older to report.
const MAX_HISTORY_DAYS = 30;
const TOP_ENDPOINTS_LIMIT = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VALIDATION_CONCURRENCY = 50;

/**
 * Helper to resolve link by shortCode or Mongo ID owned by the workspace.
 * Ownership is enforced in the query itself, not fetched-then-compared.
 */
async function findWorkspaceLink(codeOrId, workspaceId) {
  const query = {
    workspace: workspaceId,
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
  const { page = 1, limit = 20, search, tag, sort = 'createdAt_desc' } = req.query;

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

  const query = { workspace: req.activeWorkspace._id };

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
};

/**
 * POST /api/public/v1/links
 * Create a single enterprise link via Public API. All destination-field
 * validation (format, SSRF, threat-intel) and alias validation happen
 * inside createLinkRecord, shared with the dashboard API.
 */
export const createLink = async (req, res) => {
  const { originalUrl } = req.body;
  if (!originalUrl) {
    throw new ValidationError('originalUrl is required');
  }

  const owner = { userId: req.user.id, workspaceId: req.activeWorkspace._id };
  const link = await createLinkRecord(owner, req.body, { generateQr: true });

  logAudit({
    action: 'api.link.create',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    ipAddress: getClientIp(req),
    targetResourceId: String(link._id),
    diff: { shortCode: link.shortCode, originalUrl },
  });

  res.status(201).json({
    success: true,
    link: {
      id: link._id,
      shortCode: link.shortCode,
      shortUrl: `${env.FRONTEND_URL}/${link.shortCode}`,
      originalUrl: link.originalUrl,
      title: link.title,
      description: link.description,
      tags: link.tags,
      qrCode: link.qrCode,
      maxClicks: link.maxClicks,
      expiryDate: link.expiryDate,
      isActive: link.isActive,
      createdAt: link.createdAt,
    },
  });
};

/**
 * GET /api/public/v1/links/:code
 * Retrieve link metadata by shortCode or ID.
 */
export const getLink = async (req, res) => {
  const link = await findWorkspaceLink(req.params.code, req.activeWorkspace._id);
  if (!link) {
    throw new NotFoundError('Link not found');
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
};

/**
 * PATCH /api/public/v1/links/:code
 * Update destination URL or metadata for a link.
 */
export const updateLink = async (req, res) => {
  const link = await findWorkspaceLink(req.params.code, req.activeWorkspace._id);
  if (!link) {
    throw new NotFoundError('Link not found');
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

  await validateLinkRedirectFields({
    originalUrl: originalUrl && originalUrl.trim() !== link.originalUrl ? originalUrl.trim() : undefined,
    iosRedirect,
    androidRedirect,
  });

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
    updates.originalUrl = originalUrl.trim();
  }

  const updated = await Link.findByIdAndUpdate(link._id, updates, { new: true }).select('-password');

  await invalidateLinkMeta(updated.shortCode);
  if (updated.customAlias) await invalidateLinkMeta(updated.customAlias);

  logAudit({
    action: 'api.link.update',
    workspace: req.activeWorkspace._id,
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
};

/**
 * DELETE /api/public/v1/links/:code
 * Delete short link.
 */
export const deleteLink = async (req, res) => {
  const link = await findWorkspaceLink(req.params.code, req.activeWorkspace._id);
  if (!link) {
    throw new NotFoundError('Link not found');
  }

  await Link.findByIdAndDelete(link._id);
  await getAnalyticsRepository().deleteAnalytics({ linkId: String(link._id) });
  await invalidateLinkMeta(link.shortCode);
  if (link.customAlias) await invalidateLinkMeta(link.customAlias);

  logAudit({
    action: 'api.link.delete',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    ipAddress: getClientIp(req),
    targetResourceId: String(link._id),
  });

  res.status(200).json({ success: true, message: `Link '${link.shortCode}' deleted successfully` });
};

/**
 * GET /api/public/v1/links/:code/analytics
 * Retrieve analytics metrics for a specific link.
 */
export const getLinkAnalytics = async (req, res) => {
  const link = await findWorkspaceLink(req.params.code, req.activeWorkspace._id);
  if (!link) {
    throw new NotFoundError('Link not found');
  }

  // Set params for analyticsController reuse
  req.params.linkId = String(link._id);
  return fetchLinkAnalytics(req, res);
};

/**
 * POST /api/public/v1/links/bulk
 * Bulk shorten up to 1,000 links in parallel.
 */
export const bulkCreateLinks = async (req, res) => {
  const { links } = req.body;

  if (!Array.isArray(links) || links.length === 0) {
    throw new ValidationError('links must be a non-empty array');
  }
  if (links.length > MAX_BULK_SIZE) {
    throw new ValidationError(`links cannot exceed ${MAX_BULK_SIZE} entries per batch`);
  }

  const owner = { userId: req.user.id, workspaceId: req.activeWorkspace._id };
  const results = await mapWithConcurrency(links, VALIDATION_CONCURRENCY, async (item) => {
    const originalUrl = typeof item === 'string' ? item : item.originalUrl;

    try {
      const payload = typeof item === 'string' ? { originalUrl } : item;
      const link = await createLinkRecord(owner, payload, { generateQr: false });
      return {
        originalUrl,
        success: true,
        shortCode: link.shortCode,
        shortUrl: `${env.FRONTEND_URL}/${link.shortCode}`,
      };
    } catch (err) {
      const clientError = toClientError(err);
      if (!clientError) logger.error({ err, originalUrl }, 'Bulk link creation failed unexpectedly');
      return { originalUrl, success: false, message: clientError?.message ?? 'Failed to create link' };
    }
  });

  const succeeded = results.filter((r) => r.success).length;

  logAudit({
    action: 'api.link.bulk_create',
    workspace: req.activeWorkspace._id,
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
  const { capacity, refillPerSecond, keyPrefix } = PUBLIC_API_TOKEN_BUCKET;
  const remainingTokens = await peekTokenBucket(tokenBucketKey(keyPrefix, req), capacity, refillPerSecond);

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
      refillPerSecond,
      remainingTokens: Math.floor(remainingTokens),
      standardWindow: '1 second',
    },
  });
};

function parseHistoryDays(raw) {
  if (raw === undefined) return DEFAULT_HISTORY_DAYS;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_HISTORY_DAYS) {
    throw new ValidationError(`days must be an integer between 1 and ${MAX_HISTORY_DAYS}`);
  }
  return days;
}

/**
 * One entry per UTC day from `start` through today, so a chart gets a
 * continuous x-axis even on days with no requests.
 */
function fillDailySeries(start, days, rows) {
  const byDate = new Map(rows.map((row) => [row._id, row]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * MS_PER_DAY).toISOString().slice(0, 10);
    const row = byDate.get(date);
    return { date, count: row?.count ?? 0, errorCount: row?.errorCount ?? 0 };
  });
}

/**
 * GET /api/public/v1/usage/history
 * Per-day request counts, busiest endpoints and error rate for the calling
 * API key over the last `days` UTC days (today included).
 */
export const getUsageHistory = async (req, res) => {
  const days = parseHistoryDays(req.query.days);

  // Legacy User.apiKey callers have no ApiKey document, and their logs all
  // share apiKeyId: null, so there is no per-key history to scope to.
  if (!req.apiKeyDoc) {
    throw new NotFoundError('Usage history is only available for API keys created in the Developer portal');
  }

  const now = new Date();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = new Date(todayStart - (days - 1) * MS_PER_DAY);
  const isError = { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] };

  const [result] = await ApiLog.aggregate([
    { $match: { apiKeyId: req.apiKeyDoc._id, createdAt: { $gte: start } } },
    {
      $facet: {
        daily: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
              count: { $sum: 1 },
              errorCount: { $sum: isError },
            },
          },
        ],
        topEndpoints: [
          {
            $group: {
              _id: { endpoint: '$endpoint', method: '$method' },
              count: { $sum: 1 },
              errorCount: { $sum: isError },
            },
          },
          { $sort: { count: -1, '_id.endpoint': 1, '_id.method': 1 } },
          { $limit: TOP_ENDPOINTS_LIMIT },
          { $project: { _id: 0, endpoint: '$_id.endpoint', method: '$_id.method', count: 1, errorCount: 1 } },
        ],
        totals: [{ $group: { _id: null, count: { $sum: 1 }, errorCount: { $sum: isError } } }],
      },
    },
  ]);

  const totals = result.totals[0] ?? { count: 0, errorCount: 0 };
  const errorRate = totals.count === 0 ? 0 : Math.round((totals.errorCount / totals.count) * 10000) / 100;

  res.status(200).json({
    success: true,
    days,
    daily: fillDailySeries(start, days, result.daily),
    topEndpoints: result.topEndpoints,
    errorRate,
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
      '/usage/history': {
        get: {
          summary: 'Daily request counts, top endpoints and error rate for the calling API key',
          parameters: [
            {
              name: 'days',
              in: 'query',
              schema: { type: 'integer', default: DEFAULT_HISTORY_DAYS, minimum: 1, maximum: MAX_HISTORY_DAYS },
            },
          ],
          responses: { 200: { description: 'Usage history' } },
        },
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
  getUsageHistory,
  getOpenApiSpec,
};
