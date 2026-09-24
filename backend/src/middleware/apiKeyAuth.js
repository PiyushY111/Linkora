import crypto from 'crypto';
import User from '../models/User.js';
import ApiKey from '../models/ApiKey.js';
import { env } from '../config/env.js';
import { getClientIp } from '../utils/helpers.js';
import { logger } from '../config/logger.js';
import { verifyJwt } from '../utils/jwt.js';

/**
 * Authenticates public API requests via the X-API-Key header.
 * Supports:
 *  1. Hashed API keys (SHA-256 lookup in ApiKey collection)
 *  2. Masked key references from authenticated in-browser playground/CLI
 *  3. Backward-compatible legacy keys stored on User.apiKey
 */
export async function apiKeyAuth(req, res, next) {
  const headerKey = env.API_KEY_HEADER || 'x-api-key';
  const rawKey = req.headers[headerKey] || req.headers['x-api-key'];

  // Check if this is an in-browser request from Developer Playground/CLI with JWT session
  const authHeader = req.headers.authorization;
  const isBearerAuth = authHeader && authHeader.startsWith('Bearer ');
  const isMaskedKeyOrPlaceholder =
    !rawKey ||
    rawKey === 'YOUR_API_KEY' ||
    rawKey === 'undefined' ||
    rawKey === 'null' ||
    rawKey.includes('...');

  if (isBearerAuth && isMaskedKeyOrPlaceholder) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = verifyJwt(token);
      const user = await User.findById(decoded.id);

      if (user) {
        // Resolve matching active ApiKey document for this user
        let keyDoc = null;
        if (rawKey && rawKey.includes('...')) {
          keyDoc = await ApiKey.findOne({
            user: user._id,
            maskedKey: rawKey,
            status: 'active',
          });
        }
        if (!keyDoc) {
          keyDoc = await ApiKey.findOne({
            user: user._id,
            status: 'active',
          }).sort({ createdAt: -1 });
        }

        req.user = user;
        req.apiKeyDoc = keyDoc;
        req.scopes = keyDoc?.scopes || ['*'];
        req.apiKeyUser = {
          id: String(user._id),
          apiKey: keyDoc ? keyDoc.maskedKey : 'dashboard-session',
          keyId: keyDoc ? keyDoc._id : null,
          prefix: keyDoc ? keyDoc.prefix : 'session',
          environment: keyDoc ? keyDoc.environment : 'live',
        };

        if (keyDoc) {
          const clientIp = getClientIp(req);
          ApiKey.findByIdAndUpdate(keyDoc._id, {
            lastUsedAt: new Date(),
            lastUsedIp: clientIp,
            $inc: { totalRequests: 1 },
          }).catch((err) => logger.error({ err }, 'Failed to update ApiKey lastUsedAt'));
        }

        return next();
      }
    } catch (jwtErr) {
      // Fall through to standard API key authentication if JWT validation fails
    }
  }

  if (!rawKey) {
    return res.status(401).json({
      success: false,
      message: `Missing ${headerKey} header. Provide a valid API key.`,
    });
  }

  try {
    // 1. Hash incoming key using SHA-256 for secure constant-time lookup
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    // 2. Query ApiKey collection
    const keyDoc = await ApiKey.findOne({ keyHash });

    if (keyDoc) {
      if (keyDoc.status === 'revoked') {
        return res.status(401).json({
          success: false,
          message: 'API key has been revoked. Generate a new key in the Developer portal.',
        });
      }

      if (keyDoc.expiresAt && keyDoc.expiresAt < new Date()) {
        return res.status(401).json({
          success: false,
          message: 'API key has expired. Please renew or roll your key in the Developer portal.',
        });
      }

      const user = await User.findById(keyDoc.user);
      if (!user) {
        return res.status(401).json({ success: false, message: 'Owner user account not found' });
      }

      req.user = user;
      req.apiKeyDoc = keyDoc;
      req.scopes = keyDoc.scopes || ['*'];
      req.apiKeyUser = {
        id: String(user._id),
        apiKey: rawKey,
        keyId: keyDoc._id,
        prefix: keyDoc.prefix,
        environment: keyDoc.environment,
      };

      // Asynchronously update telemetry on key document without blocking response
      const clientIp = getClientIp(req);
      ApiKey.findByIdAndUpdate(keyDoc._id, {
        lastUsedAt: new Date(),
        lastUsedIp: clientIp,
        $inc: { totalRequests: 1 },
      }).catch((err) => logger.error({ err }, 'Failed to update ApiKey lastUsedAt'));

      return next();
    }

    // 3. Fallback to legacy User.apiKey for backward compatibility
    const legacyUser = await User.findOne({ apiKey: rawKey });
    if (legacyUser) {
      req.user = legacyUser;
      req.apiKeyDoc = null;
      req.scopes = ['*'];
      req.apiKeyUser = {
        id: String(legacyUser._id),
        apiKey: rawKey,
        keyId: null,
        prefix: 'legacy',
        environment: 'live',
      };
      return next();
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid API key provided. Check your key in the Developer portal.',
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in apiKeyAuth');
    return res.status(500).json({ success: false, message: 'Authentication internal failure' });
  }
}

/**
 * Middleware factory to enforce specific granular scopes on API endpoints.
 * @param {string} requiredScope - e.g. 'links:write', 'analytics:read'
 */
export function requireScope(requiredScope) {
  return (req, res, next) => {
    const scopes = req.scopes || ['*'];
    if (scopes.includes('*') || scopes.includes(requiredScope)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Forbidden: API key lacks required scope '${requiredScope}'. Granted scopes: [${scopes.join(', ')}]`,
    });
  };
}

export default apiKeyAuth;
