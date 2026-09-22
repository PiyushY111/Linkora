import express from 'express';
import { register, login, refresh, getCurrentUser, updateProfile, generateApiKey, logout } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validateRegister, validateLogin, handleValidationErrors } from '../middleware/validation.js';
import { authRateLimitMiddleware } from '../middleware/rateLimiter.js';
import ssoRoutes from './sso.js';

const router = express.Router();

router.use('/sso', ssoRoutes);

router.post('/register', validateRegister, handleValidationErrors, register);
router.post('/login', authRateLimitMiddleware, validateLogin, handleValidationErrors, login);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);
router.get('/me', protect, getCurrentUser);
router.put('/profile', protect, updateProfile);
router.post('/generate-api-key', protect, generateApiKey);

export default router;
