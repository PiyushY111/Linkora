import crypto from 'crypto';
import Webhook, { WEBHOOK_EVENTS } from '../models/Webhook.js';
import WebhookDelivery from '../models/WebhookDelivery.js';
import {
  isSafeEndpointUrl,
  testWebhookEndpoint,
  retryDelivery as executeRetryDelivery,
} from '../services/webhookService.js';
import { logAudit, auditSafeUrl } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

// Create a new webhook subscription
export const createWebhook = async (req, res) => {
  const { url, events, description } = req.body;

  if (!url || !Array.isArray(events) || events.length === 0) {
    throw new ValidationError('A destination URL and a non-empty events array are required');
  }

  // SSRF Guard
  const safeCheck = await isSafeEndpointUrl(url);
  if (!safeCheck.safe) {
    throw new ValidationError(`Endpoint URL validation failed: ${safeCheck.reason}`);
  }

  const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    throw new ValidationError(`Invalid event types: ${invalidEvents.join(', ')}`);
  }

  const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  const webhook = await Webhook.create({
    user: req.user.id,
    workspace: req.activeWorkspace._id,
    url,
    events,
    secret,
    description: description ? description.trim() : '',
  });

  logAudit({
    action: 'webhook.create',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(webhook._id),
    ipAddress: getClientIp(req),
    diff: { url: auditSafeUrl(url), events, description },
  });

  res.status(201).json({ success: true, webhook });
};

// List the active workspace's webhooks enriched with delivery health metrics
export const listWebhooks = async (req, res) => {
  const webhooks = await Webhook.find({ workspace: req.activeWorkspace._id })
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
};

// Get single webhook details + recent 50 delivery records
export const getWebhook = async (req, res) => {
  const webhook = await Webhook.findOne({ _id: req.params.id, workspace: req.activeWorkspace._id })
    .select('-secret')
    .lean();

  if (!webhook) {
    throw new NotFoundError('Webhook not found');
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
};

// Update webhook subscription
export const updateWebhook = async (req, res) => {
  const { url, events, description, isActive } = req.body;

  const webhook = await Webhook.findOne({ _id: req.params.id, workspace: req.activeWorkspace._id });
  if (!webhook) {
    throw new NotFoundError('Webhook not found');
  }

  const updateFields = {};

  if (url && url !== webhook.url) {
    const safeCheck = await isSafeEndpointUrl(url);
    if (!safeCheck.safe) {
      throw new ValidationError(`Endpoint URL validation failed: ${safeCheck.reason}`);
    }
    updateFields.url = url;
  }

  if (Array.isArray(events) && events.length > 0) {
    const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      throw new ValidationError(`Invalid event types: ${invalidEvents.join(', ')}`);
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

  const updated = await Webhook.findByIdAndUpdate(webhook._id, updateFields, {
    new: true,
  }).select('-secret');

  logAudit({
    action: 'webhook.update',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: req.params.id,
    ipAddress: getClientIp(req),
    diff: updateFields.url ? { ...updateFields, url: auditSafeUrl(updateFields.url) } : updateFields,
  });

  res.status(200).json({ success: true, webhook: updated });
};

// Delete webhook subscription and its delivery logs
export const deleteWebhook = async (req, res) => {
  const webhook = await Webhook.findOne({ _id: req.params.id, workspace: req.activeWorkspace._id });
  if (!webhook) {
    throw new NotFoundError('Webhook not found');
  }

  await Webhook.findByIdAndDelete(webhook._id);
  await WebhookDelivery.deleteMany({ webhook: webhook._id });

  logAudit({
    action: 'webhook.delete',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: req.params.id,
    ipAddress: getClientIp(req),
  });

  res.status(200).json({ success: true, message: 'Webhook and delivery logs deleted' });
};

// Test webhook endpoint with a live synthetic ping
export const testWebhook = async (req, res) => {
  const { event } = req.body;
  const result = await testWebhookEndpoint(req.params.id, req.activeWorkspace._id, event || 'endpoint.test');
  res.status(200).json({ success: true, result });
};

// Rotate signing secret
export const rotateSecret = async (req, res) => {
  const webhook = await Webhook.findOne({ _id: req.params.id, workspace: req.activeWorkspace._id });
  if (!webhook) {
    throw new NotFoundError('Webhook not found');
  }

  const newSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  webhook.secret = newSecret;
  await webhook.save();

  logAudit({
    action: 'webhook.rotateSecret',
    workspace: req.activeWorkspace._id,
    actorUserId: req.user.id,
    targetResourceId: req.params.id,
    ipAddress: getClientIp(req),
  });

  res.status(200).json({
    success: true,
    message: 'Signing secret rotated successfully',
    secret: newSecret,
  });
};

// List paginated delivery records for an endpoint
export const listDeliveries = async (req, res) => {
  const { page = 1, limit = 20, status, event } = req.query;

  const webhook = await Webhook.findOne({ _id: req.params.id, workspace: req.activeWorkspace._id });
  if (!webhook) {
    throw new NotFoundError('Webhook not found');
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
};

// Replay a past delivery attempt
export const retryDelivery = async (req, res) => {
  const result = await executeRetryDelivery(req.params.deliveryId, req.params.id, req.activeWorkspace._id);
  res.status(200).json({ success: true, result });
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
