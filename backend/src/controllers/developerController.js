import crypto from 'crypto';
import ApiKey, { API_SCOPES } from '../models/ApiKey.js';
import ApiLog from '../models/ApiLog.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

/**
 * List all API Keys belonging to the active workspace.
 */
export const listApiKeys = async (req, res) => {
  const keys = await ApiKey.find({ workspace: req.activeWorkspace._id })
    .select('-keyHash')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, keys });
};

/**
 * Create a new scoped API Key.
 * Returns the raw unhashed secret ONCE to the user.
 */
export const createApiKey = async (req, res) => {
  const { name, environment = 'live', scopes = ['*'], expiresInDays } = req.body;

  if (!name || !name.trim()) {
    throw new ValidationError('Key name is required');
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
    workspace: req.activeWorkspace._id,
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
};

/**
 * Update an existing API key's name or scopes.
 */
export const updateApiKey = async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.id, workspace: req.activeWorkspace._id });
  if (!key) {
    throw new NotFoundError('API key not found');
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
};

/**
 * Roll (rotate) an existing API key with zero downtime.
 * Generates a new secret and invalidates the previous hash.
 */
export const rollApiKey = async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.id, workspace: req.activeWorkspace._id });
  if (!key) {
    throw new NotFoundError('API key not found');
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
};

/**
 * Revoke an API key.
 */
export const revokeApiKey = async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.id, workspace: req.activeWorkspace._id });
  if (!key) {
    throw new NotFoundError('API key not found');
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
};

/**
 * Aggregate telemetry metrics for Developer dashboard.
 */
export const getDeveloperMetrics = async (req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const workspace = req.activeWorkspace._id;

  const [totalKeys, activeKeys, totalCalls24h, successCalls24h, errorCalls24h, throttledCalls24h] =
    await Promise.all([
      ApiKey.countDocuments({ workspace }),
      ApiKey.countDocuments({ workspace, status: 'active' }),
      ApiLog.countDocuments({ workspace, createdAt: { $gte: since24h } }),
      ApiLog.countDocuments({ workspace, statusCode: { $gte: 200, $lt: 300 }, createdAt: { $gte: since24h } }),
      ApiLog.countDocuments({ workspace, statusCode: { $gte: 400 }, createdAt: { $gte: since24h } }),
      ApiLog.countDocuments({ workspace, statusCode: 429, createdAt: { $gte: since24h } }),
    ]);

  // Compute average latency
  const latencyAgg = await ApiLog.aggregate([
    { $match: { workspace, createdAt: { $gte: since24h } } },
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
};

/**
 * List paginated API request audit logs.
 */
export const listApiLogs = async (req, res) => {
  const { page = 1, limit = 25, statusCode, method, keyId } = req.query;

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

  const query = { workspace: req.activeWorkspace._id };
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
};

/**
 * Returns Redis cache diagnostics & XFetch early expiration telemetry.
 */
export const getCacheDiagnosticsHandler = async (req, res) => {
  const { getCacheDiagnostics } = await import('../services/cacheService.js');
  const diagnostics = await getCacheDiagnostics();
  res.status(200).json({ success: true, diagnostics });
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
};
