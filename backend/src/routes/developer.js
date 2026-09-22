import express from 'express';
import {
  listApiKeys,
  createApiKey,
  updateApiKey,
  rollApiKey,
  revokeApiKey,
  getDeveloperMetrics,
  listApiLogs,
} from '../controllers/developerController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All developer portal routes require dashboard user authentication
router.use(protect);

router.get('/keys', listApiKeys);
router.post('/keys', createApiKey);
router.patch('/keys/:id', updateApiKey);
router.post('/keys/:id/roll', rollApiKey);
router.delete('/keys/:id', revokeApiKey);

router.get('/metrics', getDeveloperMetrics);
router.get('/logs', listApiLogs);

export default router;
