import crypto from 'crypto';
import cron from 'node-cron';
import Webhook from '../models/Webhook.js';
import Link from '../models/Link.js';
import { addToStream } from './eventStreamService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

// Exponential backoff between delivery attempts.
const RETRY_DELAYS_MS = [1000, 5000, 25000];

async function deliverWithRetry(webhook, event, data) {
  const payload = { event, data, timestamp: Date.now() };
  const signature = signPayload(payload, webhook.secret);
  const body = JSON.stringify(payload);

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Linkly-Signature': signature },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return true;
      throw new Error(`Webhook endpoint returned HTTP ${response.status}`);
    } catch (err) {
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      logger.error({ err, webhookId: webhook._id, event }, 'Webhook delivery failed after retries; sending to DLQ');
      await addToStream(env.WEBHOOK_DLQ_STREAM_KEY, {
        webhookId: String(webhook._id),
        url: webhook.url,
        event,
        payload: body,
        signature,
        failedAt: Date.now(),
      });
      return false;
    }
  }
  return false;
}

/**
 * Fire-and-forget dispatch to every active webhook a user has subscribed
 * for the given event type.
 * @param {string} userId
 * @param {'click' | 'link.expired' | 'abuse.flagged'} event
 * @param {Record<string, unknown>} data
 */
export async function dispatchEvent(userId, event, data) {
  if (!userId) return;
  const webhooks = await Webhook.find({ user: userId, isActive: true, events: event });
  for (const webhook of webhooks) {
    deliverWithRetry(webhook, event, data).catch((err) =>
      logger.error({ err, webhookId: webhook._id }, 'Unhandled webhook dispatch error')
    );
  }
}

/**
 * Periodically finds links that expired since the last sweep and fires
 * link.expired webhooks, marking them so they aren't re-notified.
 */
export async function checkExpiredLinks() {
  const now = new Date();
  const expired = await Link.find({ isActive: true, expiryDate: { $lte: now }, expiryNotified: { $ne: true } }).lean();

  for (const link of expired) {
    await dispatchEvent(String(link.user), 'link.expired', {
      linkId: String(link._id),
      shortCode: link.shortCode,
      originalUrl: link.originalUrl,
      expiryDate: link.expiryDate,
    });
    await Link.findByIdAndUpdate(link._id, { expiryNotified: true });
  }

  if (expired.length > 0) {
    logger.info({ count: expired.length }, 'Dispatched link.expired webhooks');
  }
}

export function scheduleExpiryWebhookCheck() {
  // Every 15 minutes.
  cron.schedule('*/15 * * * *', () => {
    checkExpiredLinks().catch((err) => logger.error({ err }, 'Scheduled expiry check failed'));
  });
}

export default { dispatchEvent, checkExpiredLinks, scheduleExpiryWebhookCheck };
