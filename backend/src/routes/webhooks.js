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
import { requireActiveRole } from '../middleware/rbac.js';

const router = express.Router();

// Webhooks belong to the workspace; managing them is admin+.
const adminOnly = [protect, requireActiveRole('admin')];

router.post('/', adminOnly, createWebhook);
router.get('/', adminOnly, listWebhooks);
router.get('/:id', adminOnly, getWebhook);
router.put('/:id', adminOnly, updateWebhook);
router.delete('/:id', adminOnly, deleteWebhook);

router.post('/:id/test', adminOnly, testWebhook);
router.post('/:id/rotate-secret', adminOnly, rotateSecret);

router.get('/:id/deliveries', adminOnly, listDeliveries);
router.post('/:id/deliveries/:deliveryId/retry', adminOnly, retryDelivery);

// Built-in public echo endpoint for instant testing with zero external setup
router.post('/debug/echo', (req, res) => {
  const sig = req.headers['linkora-signature'] || req.headers['linkly-signature'];
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
