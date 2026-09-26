import ApiLog from '../models/ApiLog.js';
import { getClientIp } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

// Read-only usage introspection. The Developer dashboard polls these, and
// logging them would fill the very history they report with its own polls.
const USAGE_READ_PATHS = new Set(['/usage', '/usage/history']);

/**
 * True for GET/HEAD /usage and /usage/history (relative to the v1 router).
 * @param {import('express').Request} req
 */
export function isUsageRead(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
  // Express matches routes case-insensitively, so compare the same way.
  return USAGE_READ_PATHS.has(path.toLowerCase());
}

/**
 * Asynchronously records API request telemetry into the ApiLog collection.
 * Attaches to res.on('finish') to ensure zero latency overhead on API responses.
 */
export function apiTelemetry(req, res, next) {
  if (isUsageRead(req)) return next();

  const startTime = Date.now();

  res.on('finish', () => {
    // Only log authenticated public API calls with an associated user
    if (!req.user?._id) return;

    const latencyMs = Date.now() - startTime;
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const endpoint = req.baseUrl ? `${req.baseUrl}${req.path}` : req.originalUrl || req.path;

    ApiLog.create({
      user: req.user._id,
      workspace: req.activeWorkspace?._id,
      apiKeyId: req.apiKeyDoc?._id || null,
      apiKeyPrefix: req.apiKeyDoc?.prefix || (req.apiKeyUser?.prefix ?? 'legacy'),
      method: req.method,
      endpoint,
      statusCode: res.statusCode,
      latencyMs,
      ipAddress: clientIp,
      userAgent: userAgent.slice(0, 500),
      errorMessage: res.locals?.errorMessage || (res.statusCode >= 400 ? res.statusMessage : null),
    }).catch((err) => {
      logger.error({ err }, 'Failed to write ApiLog record');
    });
  });

  next();
}

export default apiTelemetry;
