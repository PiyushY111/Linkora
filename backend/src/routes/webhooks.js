import express from 'express';
import {
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  rotateSecret,
  listDeliveries,
  retryDelivery,
} from '../controllers/webhookController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, createWebhook);
router.get('/', protect, listWebhooks);
router.get('/:id', protect, getWebhook);
router.put('/:id', protect, updateWebhook);
router.delete('/:id', protect, deleteWebhook);

router.post('/:id/test', protect, testWebhook);
router.post('/:id/rotate-secret', protect, rotateSecret);

router.get('/:id/deliveries', protect, listDeliveries);
router.post('/:id/deliveries/:deliveryId/retry', protect, retryDelivery);

// Built-in public echo endpoint for instant testing with zero external setup
router.post('/debug/echo', (req, res) => {
  const sig = req.headers['linkora-signature'];
  res.status(200).json({
    success: true,
    message: 'Webhook payload successfully delivered and acknowledged by Linkora Echo Service',
    receivedAt: new Date().toISOString(),
    event: req.body?.type || req.body?.event || 'test',
    signatureReceived: Boolean(sig),
    signatureHeader: sig || null,
    payloadSize: JSON.stringify(req.body).length,
  });
});

export default router;
