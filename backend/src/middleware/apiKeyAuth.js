import User from '../models/User.js';
import { env } from '../config/env.js';

/**
 * Authenticates public API requests via the X-API-Key header (configurable
 * via API_KEY_HEADER). Attaches the resolved user as req.user and
 * req.apiKeyUser (the latter used as the token-bucket limiter's identity).
 */
export async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers[env.API_KEY_HEADER];
  if (!apiKey) {
    return res.status(401).json({ success: false, message: `Missing ${env.API_KEY_HEADER} header` });
  }

  const user = await User.findOne({ apiKey });
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid API key' });
  }

  req.user = user;
  req.apiKeyUser = { id: String(user._id), apiKey };
  next();
}

export default apiKeyAuth;
