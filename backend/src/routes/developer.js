import express from 'express';
import {
  listApiKeys,
  createApiKey,
  updateApiKey,
  rollApiKey,
  revokeApiKey,
  getDeveloperMetrics,
  listApiLogs,
  getCacheDiagnosticsHandler,
  simulateStampedeHandler,
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

// Cache Architecture & XFetch Stampede Simulation
router.get('/cache/diagnostics', getCacheDiagnosticsHandler);
router.post('/cache/simulate-stampede', simulateStampedeHandler);

export default router;
