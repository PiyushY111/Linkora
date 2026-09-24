import express from 'express';
import {
  register,
  login,
  refresh,
  getCurrentUser,
  updateProfile,
  generateApiKey,
  changePassword,
  exportAccountData,
  deleteAccount,
  logout,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validateRegister, validateLogin, handleValidationErrors } from '../middleware/validation.js';
import { authRateLimitMiddleware, registerRateLimiter, refreshRateLimiter, loginRateLimiter } from '../middleware/rateLimiter.js';
import { verifyOriginForCsrf } from '../middleware/csrf.js';
import ssoRoutes from './sso.js';

const router = express.Router();

router.use('/sso', ssoRoutes);

function requireRefreshTokenCookie(req, res, next) {
  if (!req.cookies?.refreshToken) {
    return res.status(401).json({ success: false, message: 'No refresh token provided' });
  }
  next();
}

router.post('/register', registerRateLimiter, validateRegister, handleValidationErrors, register);
router.post('/login', loginRateLimiter, authRateLimitMiddleware, validateLogin, handleValidationErrors, login);
router.post('/refresh', verifyOriginForCsrf, requireRefreshTokenCookie, refreshRateLimiter, refresh);
router.post('/logout', verifyOriginForCsrf, logout);
router.get('/me', protect, getCurrentUser);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, changePassword);
router.get('/export-data', protect, exportAccountData);
router.delete('/account', protect, deleteAccount);
router.post('/generate-api-key', protect, generateApiKey);

export default router;
