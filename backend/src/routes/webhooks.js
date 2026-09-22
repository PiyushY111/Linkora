import express from 'express';
import { createWebhook, listWebhooks, deleteWebhook } from '../controllers/webhookController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, createWebhook);
router.get('/', protect, listWebhooks);
router.delete('/:id', protect, deleteWebhook);

export default router;
