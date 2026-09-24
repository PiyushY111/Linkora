import User from '../models/User.js';
import Link from '../models/Link.js';
import ApiKey from '../models/ApiKey.js';
import Webhook from '../models/Webhook.js';
import { generateToken, issueRefreshToken, consumeRefreshToken, revokeRefreshToken } from '../utils/jwt.js';
import { getClientIp } from '../utils/helpers.js';
import { recordAuthFailure, resetAuthFailures } from '../middleware/rateLimiter.js';
import { logAudit } from '../utils/auditLogger.js';
import { env } from '../config/env.js';
import { ValidationError, UnauthorizedError, NotFoundError } from '../lib/errors.js';
import { setRefreshTokenCookie, clearRefreshTokenCookie } from '../utils/authCookies.js';
import { getAnalyticsRepository } from '../repositories/analytics/analyticsRepository.js';

// Minimum acceptable password strength at registration: 8+ chars, at least
// one letter and one digit. Deliberately simple (no forced special-char
// rules) — those tend to push users toward predictable substitutions.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

function assertStrongPassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!PASSWORD_PATTERN.test(password)) {
    throw new ValidationError('Password must contain at least one letter and one number');
  }
}

// Register user
export const register = async (req, res) => {
  const { name, email, password } = req.body;

  assertStrongPassword(password);

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ValidationError('User already exists');
  }

  const user = await User.create({ name, email, password });

  const token = generateToken(user._id);
  const refreshToken = await issueRefreshToken(String(user._id));
  setRefreshTokenCookie(res, refreshToken);

  logAudit({ action: 'user.register', actorUserId: user._id, ipAddress: getClientIp(req) });

  res.status(201).json({
    success: true,
    token,
    expiresIn: env.JWT_ACCESS_TOKEN_TTL,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
};

// Login user
export const login = async (req, res) => {
  const ip = getClientIp(req);
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Please provide email and password');
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    await recordAuthFailure(ip);
    logAudit({ action: 'auth.login.failure', ipAddress: ip, diff: { email } });
    throw new UnauthorizedError('Invalid credentials');
  }

  await resetAuthFailures(ip);

  const token = generateToken(user._id);
  const refreshToken = await issueRefreshToken(String(user._id));
  setRefreshTokenCookie(res, refreshToken);

  logAudit({ action: 'auth.login.success', actorUserId: user._id, ipAddress: ip });

  res.status(200).json({
    success: true,
    token,
    expiresIn: env.JWT_ACCESS_TOKEN_TTL,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
};

// Rotate a refresh token (read from the httpOnly cookie) for a new access
// token + rotated refresh cookie.
export const refresh = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    throw new UnauthorizedError('No refresh token provided');
  }

  const consumed = await consumeRefreshToken(refreshToken, { ip: getClientIp(req) });
  if (!consumed) {
    clearRefreshTokenCookie(res);
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const token = generateToken(consumed.userId);
  // Reuse the same family across rotations so a later replay of this (now
  // spent) token is recognized as reuse and revokes the whole session chain.
  const newRefreshToken = await issueRefreshToken(consumed.userId, consumed.familyId);
  setRefreshTokenCookie(res, newRefreshToken);

  const user = await User.findById(consumed.userId).select('name email');

  res.status(200).json({
    success: true,
    token,
    expiresIn: env.JWT_ACCESS_TOKEN_TTL,
    user: user
      ? {
          id: user._id,
          name: user.name,
          email: user.email,
        }
      : undefined,
  });
};

// Get current user
export const getCurrentUser = async (req, res) => {
  const user = await User.findById(req.user.id).populate('links').read('secondaryPreferred');

  res.status(200).json({
    success: true,
    user,
  });
};

// Update user profile and configuration preferences
export const updateProfile = async (req, res) => {
  const {
    name,
    bio,
    avatarColor,
    defaultLinkCategory,
    defaultExpirationDays,
    defaultUtm,
    defaultAnalyticsRange,
    anonymizeVisitorIps,
    preferences,
  } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (bio !== undefined) updates.bio = bio;
  if (avatarColor !== undefined) updates.avatarColor = avatarColor;
  if (defaultLinkCategory !== undefined) updates.defaultLinkCategory = defaultLinkCategory;
  if (defaultExpirationDays !== undefined) updates.defaultExpirationDays = defaultExpirationDays;
  if (defaultUtm !== undefined) updates.defaultUtm = defaultUtm;
  if (defaultAnalyticsRange !== undefined) updates.defaultAnalyticsRange = defaultAnalyticsRange;
  if (anonymizeVisitorIps !== undefined) updates.anonymizeVisitorIps = anonymizeVisitorIps;
  if (preferences !== undefined) updates.preferences = preferences;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    updates,
    { new: true, runValidators: true }
  );

  logAudit({
    action: 'user.profile.update',
    actorUserId: req.user.id,
    targetResourceId: req.user.id,
    ipAddress: getClientIp(req),
    diff: updates,
  });

  res.status(200).json({
    success: true,
    user,
  });
};

// Change user password
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Please provide both current and new password');
  }

  assertStrongPassword(newPassword);

  const user = await User.findById(req.user.id).select('+password');
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();

  logAudit({
    action: 'user.password.change',
    actorUserId: req.user.id,
    targetResourceId: req.user.id,
    ipAddress: getClientIp(req),
  });

  res.status(200).json({
    success: true,
    message: 'Password updated successfully',
  });
};

// Export all account data (JSON archive of profile, links, tags, settings)
export const exportAccountData = async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const [links, webhooks, apiKeys] = await Promise.all([
    Link.find({ user: user._id }).lean(),
    Webhook.find({ user: user._id }).select('-secret').lean(),
    ApiKey.find({ user: user._id }).select('-keyHash').lean(),
  ]);

  const archive = {
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    account: {
      name: user.name,
      email: user.email,
      bio: user.bio,
      totalClicks: user.totalClicks,
      createdAt: user.createdAt,
      preferences: {
        avatarColor: user.avatarColor,
        defaultLinkCategory: user.defaultLinkCategory,
        defaultExpirationDays: user.defaultExpirationDays,
        defaultUtm: user.defaultUtm,
        defaultAnalyticsRange: user.defaultAnalyticsRange,
        anonymizeVisitorIps: user.anonymizeVisitorIps,
        preferences: user.preferences,
      },
    },
    summary: {
      totalLinks: links.length,
      totalWebhooks: webhooks.length,
      totalApiKeys: apiKeys.length,
    },
    links: links.map((l) => ({
      id: l._id,
      shortCode: l.shortCode,
      originalUrl: l.originalUrl,
      title: l.title,
      description: l.description,
      tags: l.tags,
      category: l.category,
      clicks: l.clicks,
      uniqueVisitors: l.uniqueVisitors,
      isActive: l.isActive,
      expiryDate: l.expiryDate,
      createdAt: l.createdAt,
    })),
    webhooks: webhooks.map((w) => ({
      id: w._id,
      url: w.url,
      description: w.description,
      events: w.events,
      isActive: w.isActive,
      createdAt: w.createdAt,
    })),
    apiKeys: apiKeys.map((k) => ({
      id: k._id,
      name: k.name,
      prefix: k.prefix,
      maskedKey: k.maskedKey,
      environment: k.environment,
      scopes: k.scopes,
      createdAt: k.createdAt,
    })),
  };

  res.status(200).json(archive);
};

// Permanently delete user account and cascade delete all associated resources
export const deleteAccount = async (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required to delete account');
  }

  const user = await User.findById(req.user.id).select('+password');
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new ValidationError('Incorrect password');
  }

  // Cascade deletion of all user records
  await Promise.all([
    Link.deleteMany({ user: user._id }),
    ApiKey.deleteMany({ user: user._id }),
    Webhook.deleteMany({ user: user._id }),
    getAnalyticsRepository().deleteAnalytics({ userId: String(user._id) }),
    User.findByIdAndDelete(user._id),
  ]);

  logAudit({
    action: 'user.account.delete',
    actorUserId: req.user.id,
    targetResourceId: req.user.id,
    ipAddress: getClientIp(req),
  });

  clearRefreshTokenCookie(res);

  res.status(200).json({
    success: true,
    message: 'Account and all associated links, webhooks, and API keys permanently deleted',
  });
};

// Generate API key
export const generateApiKey = async (req, res) => {
  const user = await User.findById(req.user.id);
  const apiKey = user.generateApiKey();
  await user.save();

  logAudit({
    action: 'user.apikey.generate',
    actorUserId: req.user.id,
    targetResourceId: req.user.id,
    ipAddress: getClientIp(req),
  });

  res.status(200).json({
    success: true,
    apiKey,
  });
};

// Logout
export const logout = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  clearRefreshTokenCookie(res);
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};
