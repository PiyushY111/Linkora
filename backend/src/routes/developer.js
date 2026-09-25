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
} from '../controllers/developerController.js';
import { protect } from '../middleware/auth.js';
import { requireActiveRole } from '../middleware/rbac.js';

const router = express.Router();

// All developer portal routes require dashboard user authentication
router.use(protect);

// API keys and their usage belong to the workspace; managing them is admin+.
const adminOnly = requireActiveRole('admin');

router.get('/keys', adminOnly, listApiKeys);
router.post('/keys', adminOnly, createApiKey);
router.patch('/keys/:id', adminOnly, updateApiKey);
router.post('/keys/:id/roll', adminOnly, rollApiKey);
router.delete('/keys/:id', adminOnly, revokeApiKey);

router.get('/metrics', adminOnly, getDeveloperMetrics);
router.get('/logs', adminOnly, listApiLogs);

router.get('/cache/diagnostics', getCacheDiagnosticsHandler);

export default router;
