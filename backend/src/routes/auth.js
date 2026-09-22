import express from 'express';
import { register, login, getCurrentUser, updateProfile, generateApiKey, logout } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validateRegister, validateLogin, handleValidationErrors } from '../middleware/validation.js';

const router = express.Router();

router.post('/register', validateRegister, handleValidationErrors, register);
router.post('/login', validateLogin, handleValidationErrors, login);
router.post('/logout', protect, logout);
router.get('/me', protect, getCurrentUser);
router.put('/profile', protect, updateProfile);
router.post('/generate-api-key', protect, generateApiKey);

export default router;
