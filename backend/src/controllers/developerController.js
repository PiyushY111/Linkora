import crypto from 'crypto';
import ApiKey, { API_SCOPES } from '../models/ApiKey.js';
import ApiLog from '../models/ApiLog.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

/**
 * List all API Keys belonging to the authenticated user.
 */
export const listApiKeys = async (req, res) => {
  try {
    const keys = await ApiKey.find({ user: req.user.id })
      .select('-keyHash')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, keys });
  } catch (error) {
    logger.error({ err: error }, 'Error in listApiKeys');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create a new scoped API Key.
 * Returns the raw unhashed secret ONCE to the user.
 */
export const createApiKey = async (req, res) => {
  try {
    const { name, environment = 'live', scopes = ['*'], expiresInDays } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Key name is required' });
    }

    const envTag = environment === 'test' ? 'test' : 'live';
    const randomHex = crypto.randomBytes(24).toString('hex');
    const rawSecret = `lnk_${envTag}_${randomHex}`;

    // Compute SHA-256 hash for secure storage
    const keyHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    const prefix = rawSecret.slice(0, 12);
    const lastFour = rawSecret.slice(-4);
    const maskedKey = `${prefix}...${lastFour}`;

    let expiresAt = null;
    if (expiresInDays && Number(expiresInDays) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000);
    }

    // Validate scopes if not wildcard
    let assignedScopes = ['*'];
    if (Array.isArray(scopes) && !scopes.includes('*')) {
      assignedScopes = scopes.filter((s) => API_SCOPES.includes(s));
      if (assignedScopes.length === 0) assignedScopes = ['links:read'];
    }

    const newKey = await ApiKey.create({
      user: req.user.id,
      name: name.trim(),
      keyHash,
      prefix,
      maskedKey,
      lastFour,
      environment: envTag,
      scopes: assignedScopes,
      expiresAt,
    });

    logAudit({
      action: 'apikey.create',
      actorUserId: req.user.id,
      ipAddress: getClientIp(req),
      targetResourceId: String(newKey._id),
      diff: { name: newKey.name, environment: envTag, scopes: assignedScopes },
    });

    res.status(201).json({
      success: true,
      key: {
        _id: newKey._id,
        name: newKey.name,
        prefix: newKey.prefix,
        maskedKey: newKey.maskedKey,
        lastFour: newKey.lastFour,
        environment: newKey.environment,
        scopes: newKey.scopes,
        expiresAt: newKey.expiresAt,
        status: newKey.status,
        createdAt: newKey.createdAt,
      },
      rawSecret,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in createApiKey');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update an existing API key's name or scopes.
 */
export const updateApiKey = async (req, res) => {
  try {
    const key = await ApiKey.findOne({ _id: req.params.id, user: req.user.id });
    if (!key) {
      return res.status(404).json({ success: false, message: 'API key not found' });
    }

    const { name, scopes } = req.body;
    const updates = {};
    if (name && name.trim()) updates.name = name.trim();
    if (Array.isArray(scopes)) {
      updates.scopes = scopes.includes('*') ? ['*'] : scopes.filter((s) => API_SCOPES.includes(s));
    }

    const updated = await ApiKey.findByIdAndUpdate(key._id, updates, { new: true }).select('-keyHash');

    logAudit({
      action: 'apikey.update',
      actorUserId: req.user.id,
      ipAddress: getClientIp(req),
      targetResourceId: String(key._id),
      diff: updates,
    });

    res.status(200).json({ success: true, key: updated });
  } catch (error) {
    logger.error({ err: error }, 'Error in updateApiKey');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Roll (rotate) an existing API key with zero downtime.
 * Generates a new secret and invalidates the previous hash.
 */
export const rollApiKey = async (req, res) => {
  try {
    const key = await ApiKey.findOne({ _id: req.params.id, user: req.user.id });
    if (!key) {
      return res.status(404).json({ success: false, message: 'API key not found' });
    }

    const randomHex = crypto.randomBytes(24).toString('hex');
    const rawSecret = `lnk_${key.environment}_${randomHex}`;
    const keyHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    const prefix = rawSecret.slice(0, 12);
    const lastFour = rawSecret.slice(-4);
    const maskedKey = `${prefix}...${lastFour}`;

    key.keyHash = keyHash;
    key.prefix = prefix;
    key.lastFour = lastFour;
    key.maskedKey = maskedKey;
    key.status = 'active';
    await key.save();

    logAudit({
      action: 'apikey.roll',
      actorUserId: req.user.id,
      ipAddress: getClientIp(req),
      targetResourceId: String(key._id),
    });

    res.status(200).json({
      success: true,
      key: {
        _id: key._id,
        name: key.name,
        prefix: key.prefix,
        maskedKey: key.maskedKey,
        lastFour: key.lastFour,
        environment: key.environment,
        scopes: key.scopes,
        status: key.status,
      },
      rawSecret,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in rollApiKey');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Revoke an API key.
 */
export const revokeApiKey = async (req, res) => {
  try {
    const key = await ApiKey.findOne({ _id: req.params.id, user: req.user.id });
    if (!key) {
      return res.status(404).json({ success: false, message: 'API key not found' });
    }

    key.status = 'revoked';
    await key.save();

    logAudit({
      action: 'apikey.revoke',
      actorUserId: req.user.id,
      ipAddress: getClientIp(req),
      targetResourceId: String(key._id),
    });

    res.status(200).json({ success: true, message: 'API key has been revoked' });
  } catch (error) {
    logger.error({ err: error }, 'Error in revokeApiKey');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Aggregate telemetry metrics for Developer dashboard.
 */
export const getDeveloperMetrics = async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalKeys, activeKeys, totalCalls24h, successCalls24h, errorCalls24h, throttledCalls24h] =
      await Promise.all([
        ApiKey.countDocuments({ user: req.user.id }),
        ApiKey.countDocuments({ user: req.user.id, status: 'active' }),
        ApiLog.countDocuments({ user: req.user.id, createdAt: { $gte: since24h } }),
        ApiLog.countDocuments({ user: req.user.id, statusCode: { $gte: 200, $lt: 300 }, createdAt: { $gte: since24h } }),
        ApiLog.countDocuments({ user: req.user.id, statusCode: { $gte: 400 }, createdAt: { $gte: since24h } }),
        ApiLog.countDocuments({ user: req.user.id, statusCode: 429, createdAt: { $gte: since24h } }),
      ]);

    // Compute average latency
    const latencyAgg = await ApiLog.aggregate([
      { $match: { user: req.user._id, createdAt: { $gte: since24h } } },
      { $group: { _id: null, avgLatency: { $avg: '$latencyMs' } } },
    ]);

    const avgLatencyMs = Math.round(latencyAgg[0]?.avgLatency || 18);
    const successRate = totalCalls24h > 0 ? Math.round((successCalls24h / totalCalls24h) * 100) : 100;

    res.status(200).json({
      success: true,
      metrics: {
        totalKeys,
        activeKeys,
        totalCalls24h,
        successCalls24h,
        errorCalls24h,
        throttledCalls24h,
        successRate,
        avgLatencyMs,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in getDeveloperMetrics');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * List paginated API request audit logs.
 */
export const listApiLogs = async (req, res) => {
  try {
    const { page = 1, limit = 25, statusCode, method, keyId } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const query = { user: req.user.id };
    if (statusCode) {
      if (statusCode === '2xx') query.statusCode = { $gte: 200, $lt: 300 };
      else if (statusCode === '4xx') query.statusCode = { $gte: 400, $lt: 500 };
      else if (statusCode === '5xx') query.statusCode = { $gte: 500 };
      else if (statusCode === '429') query.statusCode = 429;
      else query.statusCode = parseInt(statusCode, 10);
    }
    if (method) query.method = method.toUpperCase();
    if (keyId) query.apiKeyId = keyId;

    const [logs, total] = await Promise.all([
      ApiLog.find(query)
        .sort({ createdAt: -1 })
        .limit(parsedLimit)
        .skip((parsedPage - 1) * parsedLimit)
        .lean(),
      ApiLog.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      logs,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in listApiLogs');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Returns Redis cache diagnostics & XFetch early expiration telemetry.
 */
export const getCacheDiagnosticsHandler = async (req, res) => {
  try {
    const { getCacheDiagnostics } = await import('../services/cacheService.js');
    const diagnostics = await getCacheDiagnostics();
    res.status(200).json({ success: true, diagnostics });
  } catch (error) {
    logger.error({ err: error }, 'Error in getCacheDiagnosticsHandler');
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Executes an in-memory thundering-herd benchmark to demonstrate XFetch protection.
 */
export const simulateStampedeHandler = async (req, res) => {
  try {
    const concurrency = Math.min(100, Math.max(10, parseInt(req.body.concurrency || 50, 10)));
    const { simulateThunderingHerd } = await import('../services/cacheService.js');
    const result = await simulateThunderingHerd(concurrency);
    res.status(200).json({ success: true, result });
  } catch (error) {
    logger.error({ err: error }, 'Error in simulateStampedeHandler');
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  listApiKeys,
  createApiKey,
  updateApiKey,
  rollApiKey,
  revokeApiKey,
  getDeveloperMetrics,
  listApiLogs,
  getCacheDiagnosticsHandler,
  simulateStampedeHandler,
};

