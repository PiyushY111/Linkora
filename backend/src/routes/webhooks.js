import express from 'express';
import {
  listEventCatalog,
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  rotateSecret,
  listDeliveries,
  getDelivery,
  replayDelivery,
  bulkReplay,
} from '../controllers/webhookController.js';
import { protect } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { webhookTestRateLimiter, webhookReplayRateLimiter } from '../middleware/rateLimiter.js';
import { env } from '../config/env.js';

const router = express.Router();

// Webhooks belong to the workspace; see 'webhooks:manage' in
// utils/permissions.js (reads included: URLs can be secrets, and delivery
// payloads carry visitor IPs).
const adminOnly = [protect, requirePermission('webhooks:manage')];

router.get('/events', adminOnly, listEventCatalog);

router.post('/', adminOnly, createWebhook);
router.get('/', adminOnly, listWebhooks);
router.get('/:id', adminOnly, getWebhook);
router.put('/:id', adminOnly, updateWebhook);
router.delete('/:id', adminOnly, deleteWebhook);

router.post('/:id/test', adminOnly, webhookTestRateLimiter, testWebhook);
router.post('/:id/rotate-secret', adminOnly, rotateSecret);

router.get('/:id/deliveries', adminOnly, listDeliveries);
router.get('/:id/deliveries/:deliveryId', adminOnly, getDelivery);
router.post('/:id/deliveries/:deliveryId/replay', adminOnly, webhookReplayRateLimiter, replayDelivery);
router.post('/:id/replay', adminOnly, webhookReplayRateLimiter, bulkReplay);

// Built-in echo endpoint for trying webhooks with zero external setup. It
// can't verify signatures (it holds no secret), and it's a public POST
// target, so it exists only outside production.
if (env.NODE_ENV !== 'production') {
  router.post('/debug/echo', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Received by the Linkora echo endpoint',
      receivedAt: new Date().toISOString(),
      eventId: req.headers['linkora-event-id'] || null,
      type: req.body?.type || null,
      attempt: Number(req.headers['linkora-attempt']) || null,
      signatureReceived: Boolean(req.headers['linkora-signature']),
    });
  });
}

export default router;
