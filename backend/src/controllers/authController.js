import User from '../models/User.js';
import { generateToken, issueRefreshToken, consumeRefreshToken, revokeRefreshToken } from '../utils/jwt.js';
import { getClientIp } from '../utils/helpers.js';
import { recordAuthFailure, resetAuthFailures } from '../middleware/rateLimiter.js';
import { logAudit } from '../utils/auditLogger.js';
import { env } from '../config/env.js';

// Register user
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Create user
    user = await User.create({
      name,
      email,
      password,
    });

    const token = generateToken(user._id);
    const refreshToken = await issueRefreshToken(String(user._id));

    logAudit({ action: 'user.register', actorUserId: user._id, ipAddress: getClientIp(req) });

    res.status(201).json({
      success: true,
      token,
      refreshToken,
      expiresIn: env.JWT_ACCESS_TOKEN_TTL,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Login user
export const login = async (req, res) => {
  const ip = getClientIp(req);
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      await recordAuthFailure(ip);
      logAudit({ action: 'auth.login.failure', ipAddress: ip, diff: { email } });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await resetAuthFailures(ip);

    const token = generateToken(user._id);
    const refreshToken = await issueRefreshToken(String(user._id));

    logAudit({ action: 'auth.login.success', actorUserId: user._id, ipAddress: ip });

    res.status(200).json({
      success: true,
      token,
      refreshToken,
      expiresIn: env.JWT_ACCESS_TOKEN_TTL,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Rotate a refresh token for a new access/refresh token pair
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'refreshToken is required' });
    }

    const userId = await consumeRefreshToken(refreshToken);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const token = generateToken(userId);
    const newRefreshToken = await issueRefreshToken(userId);

    res.status(200).json({
      success: true,
      token,
      refreshToken: newRefreshToken,
      expiresIn: env.JWT_ACCESS_TOKEN_TTL,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get current user
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('links').read('secondaryPreferred');

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update user profile
export const updateProfile = async (req, res) => {
  try {
    const { name, bio } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, bio },
      { new: true, runValidators: true }
    );

    logAudit({
      action: 'user.profile.update',
      actorUserId: req.user.id,
      targetResourceId: req.user.id,
      ipAddress: getClientIp(req),
      diff: { name, bio },
    });

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Generate API key
export const generateApiKey = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Logout
export const logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};
