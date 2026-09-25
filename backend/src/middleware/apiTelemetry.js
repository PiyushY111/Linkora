import ApiLog from '../models/ApiLog.js';
import { getClientIp } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

/**
 * Asynchronously records API request telemetry into the ApiLog collection.
 * Attaches to res.on('finish') to ensure zero latency overhead on API responses.
 */
export function apiTelemetry(req, res, next) {
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
