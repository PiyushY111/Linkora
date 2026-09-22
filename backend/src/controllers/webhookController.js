import crypto from 'crypto';
import Webhook, { WEBHOOK_EVENTS } from '../models/Webhook.js';
import WebhookDelivery from '../models/WebhookDelivery.js';
import {
  isSafeEndpointUrl,
  testWebhookEndpoint,
  retryDelivery as executeRetryDelivery,
} from '../services/webhookService.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

// Create a new webhook subscription
export const createWebhook = async (req, res) => {
  try {
    const { url, events, description } = req.body;

    if (!url || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A destination URL and a non-empty events array are required',
      });
    }

    // SSRF Guard
    const safeCheck = await isSafeEndpointUrl(url);
    if (!safeCheck.safe) {
      return res.status(400).json({
        success: false,
        message: `Endpoint URL validation failed: ${safeCheck.reason}`,
      });
    }

    const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid event types: ${invalidEvents.join(', ')}`,
      });
    }

    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const webhook = await Webhook.create({
      user: req.user.id,
      url,
      events,
      secret,
      description: description ? description.trim() : '',
    });

    logAudit({
      action: 'webhook.create',
      actorUserId: req.user.id,
      targetResourceId: String(webhook._id),
      ipAddress: getClientIp(req),
      diff: { url, events, description },
    });

    res.status(201).json({ success: true, webhook });
  } catch (error) {
    logger.error({ err: error }, 'Error in createWebhook');
    res.status(500).json({ success: false, message: error.message });
  }
};

// List user webhooks enriched with delivery health metrics
export const listWebhooks = async (req, res) => {
  try {
    const webhooks = await Webhook.find({ user: req.user.id })
      .select('-secret')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with 24h delivery stats and recent delivery status dots
    const enriched = await Promise.all(
      webhooks.map(async (hook) => {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [total24h, success24h, recentDeliveries] = await Promise.all([
          WebhookDelivery.countDocuments({ webhook: hook._id, createdAt: { $gte: since24h } }),
          WebhookDelivery.countDocuments({ webhook: hook._id, status: 'success', createdAt: { $gte: since24h } }),
          WebhookDelivery.find({ webhook: hook._id })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('status responseStatus latencyMs createdAt')
            .lean(),
        ]);

        const successRate = total24h > 0 ? Math.round((success24h / total24h) * 100) : 100;

        return {
          ...hook,
          deliveryStats: {
            total24h,
            success24h,
            successRate,
            recentDeliveries,
          },
        };
      })
    );

    res.status(200).json({ success: true, webhooks: enriched });
  } catch (error) {
    logger.error({ err: error }, 'Error in listWebhooks');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single webhook details + recent 50 delivery records
export const getWebhook = async (req, res) => {
  try {
    const webhook = await Webhook.findOne({ _id: req.params.id, user: req.user.id })
      .select('-secret')
      .lean();

    if (!webhook) {
      return res.status(404).json({ success: false, message: 'Webhook not found' });
    }

    const recentDeliveries = await WebhookDelivery.find({ webhook: webhook._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      webhook,
      recentDeliveries,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in getWebhook');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update webhook subscription
export const updateWebhook = async (req, res) => {
  try {
    const { url, events, description, isActive } = req.body;

    const webhook = await Webhook.findOne({ _id: req.params.id, user: req.user.id });
    if (!webhook) {
      return res.status(404).json({ success: false, message: 'Webhook not found' });
    }

    const updateFields = {};

    if (url && url !== webhook.url) {
      const safeCheck = await isSafeEndpointUrl(url);
      if (!safeCheck.safe) {
        return res.status(400).json({
          success: false,
          message: `Endpoint URL validation failed: ${safeCheck.reason}`,
        });
      }
      updateFields.url = url;
    }

    if (Array.isArray(events) && events.length > 0) {
      const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
      if (invalidEvents.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid event types: ${invalidEvents.join(', ')}`,
        });
      }
      updateFields.events = events;
    }

    if (description !== undefined) {
      updateFields.description = description ? description.trim() : '';
    }

    if (typeof isActive === 'boolean') {
      updateFields.isActive = isActive;
      if (isActive) {
        // Reset failure counter if user is reactivating
        updateFields.consecutiveFailures = 0;
        updateFields.disabledAt = null;
      }
    }

    const updated = await Webhook.findByIdAndUpdate(req.params.id, updateFields, {
      new: true,
    }).select('-secret');

    logAudit({
      action: 'webhook.update',
      actorUserId: req.user.id,
      targetResourceId: req.params.id,
      ipAddress: getClientIp(req),
      diff: updateFields,
    });

    res.status(200).json({ success: true, webhook: updated });
  } catch (error) {
    logger.error({ err: error }, 'Error in updateWebhook');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete webhook subscription and its delivery logs
export const deleteWebhook = async (req, res) => {
  try {
    const webhook = await Webhook.findOne({ _id: req.params.id, user: req.user.id });
    if (!webhook) {
      return res.status(404).json({ success: false, message: 'Webhook not found' });
    }

    await Webhook.findByIdAndDelete(req.params.id);
    await WebhookDelivery.deleteMany({ webhook: req.params.id });

    logAudit({
      action: 'webhook.delete',
      actorUserId: req.user.id,
      targetResourceId: req.params.id,
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, message: 'Webhook and delivery logs deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error in deleteWebhook');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Test webhook endpoint with a live synthetic ping
export const testWebhook = async (req, res) => {
  try {
    const { event } = req.body;
    const result = await testWebhookEndpoint(req.params.id, req.user.id, event || 'endpoint.test');
    res.status(200).json({ success: true, result });
  } catch (error) {
    logger.error({ err: error }, 'Error in testWebhook');
    res.status(400).json({ success: false, message: error.message });
  }
};

// Rotate signing secret
export const rotateSecret = async (req, res) => {
  try {
    const webhook = await Webhook.findOne({ _id: req.params.id, user: req.user.id });
    if (!webhook) {
      return res.status(404).json({ success: false, message: 'Webhook not found' });
    }

    const newSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    webhook.secret = newSecret;
    await webhook.save();

    logAudit({
      action: 'webhook.rotateSecret',
      actorUserId: req.user.id,
      targetResourceId: req.params.id,
      ipAddress: getClientIp(req),
    });

    res.status(200).json({
      success: true,
      message: 'Signing secret rotated successfully',
      secret: newSecret,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in rotateSecret');
    res.status(500).json({ success: false, message: error.message });
  }
};

// List paginated delivery records for an endpoint
export const listDeliveries = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, event } = req.query;

    const webhook = await Webhook.findOne({ _id: req.params.id, user: req.user.id });
    if (!webhook) {
      return res.status(404).json({ success: false, message: 'Webhook not found' });
    }

    const query = { webhook: webhook._id };
    if (status) query.status = status;
    if (event) query.event = event;

    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const [deliveries, totalCount] = await Promise.all([
      WebhookDelivery.find(query)
        .sort({ createdAt: -1 })
        .limit(parsedLimit)
        .skip((parsedPage - 1) * parsedLimit)
        .lean(),
      WebhookDelivery.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      deliveries,
      pagination: {
        totalCount,
        page: parsedPage,
        pages: Math.ceil(totalCount / parsedLimit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in listDeliveries');
    res.status(500).json({ success: false, message: error.message });
  }
};

// Replay a past delivery attempt
export const retryDelivery = async (req, res) => {
  try {
    const result = await executeRetryDelivery(req.params.deliveryId, req.user.id);
    res.status(200).json({ success: true, result });
  } catch (error) {
    logger.error({ err: error }, 'Error in retryDelivery');
    res.status(400).json({ success: false, message: error.message });
  }
};

export default {
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  rotateSecret,
  listDeliveries,
  retryDelivery,
};
