import crypto from 'crypto';
import Webhook from '../models/Webhook.js';
import { WEBHOOK_EVENTS } from '../models/Webhook.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';

export const createWebhook = async (req, res) => {
  const { url, events } = req.body;

  if (!url || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ success: false, message: 'url and a non-empty events array are required' });
  }
  const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    return res.status(400).json({ success: false, message: `Invalid event types: ${invalidEvents.join(', ')}` });
  }

  const secret = crypto.randomBytes(32).toString('hex');
  const webhook = await Webhook.create({ user: req.user.id, url, events, secret });

  logAudit({
    action: 'webhook.create',
    actorUserId: req.user.id,
    targetResourceId: String(webhook._id),
    ipAddress: getClientIp(req),
    diff: { url, events },
  });

  // secret is only ever returned once, at creation time.
  res.status(201).json({ success: true, webhook });
};

export const listWebhooks = async (req, res) => {
  const webhooks = await Webhook.find({ user: req.user.id }).select('-secret');
  res.status(200).json({ success: true, webhooks });
};

export const deleteWebhook = async (req, res) => {
  const webhook = await Webhook.findById(req.params.id);
  if (!webhook) return res.status(404).json({ success: false, message: 'Webhook not found' });
  if (webhook.user.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  await Webhook.findByIdAndDelete(req.params.id);

  logAudit({
    action: 'webhook.delete',
    actorUserId: req.user.id,
    targetResourceId: req.params.id,
    ipAddress: getClientIp(req),
  });

  res.status(200).json({ success: true, message: 'Webhook deleted' });
};

export default { createWebhook, listWebhooks, deleteWebhook };
