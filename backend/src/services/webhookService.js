import crypto from 'crypto';
import dns from 'dns';
import cron from 'node-cron';
import Webhook from '../models/Webhook.js';
import WebhookDelivery from '../models/WebhookDelivery.js';
import Link from '../models/Link.js';
import { addToStream } from './eventStreamService.js';
import { validateUrlSafety } from '../middleware/ssrfValidator.js';
import { ssrfSafeFetch, BlockedDestinationError } from '../lib/ssrfSafeDispatcher.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Exponential backoff delays: 10s, 1m, 5m, 30m, 2h
const RETRY_DELAYS_MS = [10000, 60000, 300000, 1800000, 7200000];

const DELIVERY_TIMEOUT_MS = 10000;
const METADATA_HOSTNAMES = ['metadata.google.internal'];

/**
 * Registration-time check for a webhook URL, with the same IP policy as
 * link destinations (lib/ipBlocklist.js). Private and loopback targets are
 * refused unless WEBHOOK_ALLOW_PRIVATE_TARGETS is set, which env.js
 * forbids in production; cloud metadata is refused regardless. Delivery
 * re-checks at connect time (lib/ssrfSafeDispatcher.js), so passing here
 * is necessary but not sufficient.
 *
 * @param {string} urlStr
 * @param {{ lookup?: typeof dns.promises.lookup, allowPrivate?: boolean }} [options]
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function isSafeEndpointUrl(
  urlStr,
  { lookup = dns.promises.lookup, allowPrivate = env.WEBHOOK_ALLOW_PRIVATE_TARGETS } = {}
) {
  let host;
  try {
    host = new URL(urlStr).hostname.toLowerCase();
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }
  if (METADATA_HOSTNAMES.some((name) => host === name || host.endsWith(`.${name}`))) {
    return { safe: false, reason: 'Access to cloud metadata endpoints is forbidden' };
  }
  return validateUrlSafety(urlStr, { lookup, allowPrivate });
}

/**
 * Generates industry-standard timestamped HMAC-SHA256 signature
 * Format: t=<unix_ts>,v1=<hex_hmac>
 */
export function generateSignature(payloadString, secret, timestamp) {
  const t = timestamp || Math.floor(Date.now() / 1000);
  const signaturePayload = `${t}.${payloadString}`;
  const hmac = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');
  const legacyHmac = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  return {
    timestamp: t,
    signature: `t=${t},v1=${hmac}`,
    legacySignature: legacyHmac,
  };
}

/**
 * A delivery error message for the webhook owner's delivery log. Built from
 * error codes, not raw error text.
 */
function describeDeliveryError(err, url) {
  const cause = err?.cause;
  if (err instanceof BlockedDestinationError || cause instanceof BlockedDestinationError) {
    return 'Destination resolves to a private or restricted address; delivery blocked';
  }
  if (err?.name === 'TimeoutError' || cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || cause?.code === 'ETIMEDOUT') {
    return `Request timed out after ${DELIVERY_TIMEOUT_MS}ms: destination did not respond in time`;
  }
  if (cause?.code === 'ECONNREFUSED') return `Connection refused: no server listening at ${url}`;
  if (cause?.code === 'ENOTFOUND') return 'DNS resolution failed: hostname could not be found';
  if (cause?.code === 'ECONNRESET') return 'Connection reset by the destination';
  if (cause?.code) return `Network error (${cause.code})`;
  return 'Network request failed';
}

/**
 * Executes a single HTTP webhook delivery attempt, records telemetry and response preview.
 */
export async function executeDelivery(
  webhook,
  event,
  data,
  attempt = 1,
  existingDeliveryId = null,
  { lookup = dns.promises.lookup, allowPrivateNetworks = env.WEBHOOK_ALLOW_PRIVATE_TARGETS } = {}
) {
  const deliveryId = existingDeliveryId || `del_${crypto.randomBytes(12).toString('hex')}`;
  const eventId = `evt_${crypto.randomBytes(12).toString('hex')}`;
  const now = Date.now();

  const payload = {
    id: eventId,
    event,
    createdAt: new Date(now).toISOString(),
    data,
  };

  const payloadString = JSON.stringify(payload);
  const sigInfo = generateSignature(payloadString, webhook.secret, Math.floor(now / 1000));

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Linkora-Webhooks/1.0 (+https://github.com/PiyushY111/Linkora)',
    'Linkora-Delivery': deliveryId,
    'Linkora-Event': event,
    'Linkora-Signature': sigInfo.signature,
    'X-Linkora-Signature': sigInfo.legacySignature,
    'Linkly-Delivery': deliveryId,
    'Linkly-Event': event,
    'Linkly-Signature': sigInfo.signature,
    'X-Linkly-Signature': sigInfo.legacySignature,
  };

  let responseStatus = null;
  let responseHeaders = {};
  let responseBody = '';
  let errorMsg = null;
  let isSuccess = false;
  const startTime = Date.now();

  try {
    const response = await ssrfSafeFetch(
      webhook.url,
      {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      },
      { lookup, allowPrivate: allowPrivateNetworks }
    );

    responseStatus = response.status;
    responseHeaders = response.headers;
    responseBody = response.body;

    if (response.status >= 300 && response.status < 400) {
      // A redirect could point anywhere, including an internal address, so
      // it is recorded as a failure rather than followed.
      errorMsg = 'Endpoint attempted to redirect the webhook request, which is not permitted';
    } else if (response.status >= 200 && response.status < 300) {
      isSuccess = true;
    } else {
      errorMsg = `Endpoint returned HTTP status ${response.status} (${response.statusText || 'Error'})`;
    }
  } catch (err) {
    errorMsg = describeDeliveryError(err, webhook.url);
  }

  const latencyMs = Date.now() - startTime;
  const isFinalAttempt = attempt >= RETRY_DELAYS_MS.length;
  const deliveryStatus = isSuccess ? 'success' : isFinalAttempt ? 'failed' : 'retrying';

  // Persist delivery log to MongoDB
  let deliveryRecord;
  try {
    deliveryRecord = await WebhookDelivery.create({
      webhook: webhook._id,
      user: webhook.user,
      event,
      url: webhook.url,
      status: deliveryStatus,
      responseStatus,
      requestHeaders: headers,
      requestPayload: payload,
      responseHeaders,
      responseBody,
      latencyMs,
      attempt,
      error: errorMsg,
    });
  } catch (logErr) {
    logger.error({ err: logErr, webhookId: webhook._id }, 'Failed to record WebhookDelivery log');
  }

  // Update Webhook endpoint health metrics
  try {
    if (isSuccess) {
      await Webhook.findByIdAndUpdate(webhook._id, {
        consecutiveFailures: 0,
        lastDeliveryStatus: 'success',
        lastDeliveredAt: new Date(),
      });
    } else {
      const updated = await Webhook.findByIdAndUpdate(
        webhook._id,
        {
          $inc: { consecutiveFailures: 1 },
          lastDeliveryStatus: 'failed',
          lastDeliveredAt: new Date(),
        },
        { new: true }
      );

      // Auto-disable if 10 consecutive failures
      if (updated && updated.consecutiveFailures >= 10 && updated.isActive) {
        await Webhook.findByIdAndUpdate(webhook._id, {
          isActive: false,
          disabledAt: new Date(),
        });
        logger.warn({ webhookId: webhook._id, url: webhook.url }, 'Webhook automatically disabled due to 10 consecutive failures');
      }

      // Schedule retry with exponential backoff if not final attempt
      if (!isFinalAttempt) {
        const nextDelay = RETRY_DELAYS_MS[attempt - 1] + Math.floor(Math.random() * 2000);
        setTimeout(() => {
          executeDelivery(webhook, event, data, attempt + 1, deliveryId).catch((retryErr) =>
            logger.error({ err: retryErr, webhookId: webhook._id }, 'Failed during webhook retry execution')
          );
        }, nextDelay);
      } else {
        // Send to Dead Letter Queue (DLQ)
        logger.error({ webhookId: webhook._id, url: webhook.url }, 'Webhook delivery exhausted all retries; enqueued to DLQ');
        await addToStream(
          env.WEBHOOK_DLQ_STREAM_KEY,
          {
            webhookId: String(webhook._id),
            deliveryId,
            url: webhook.url,
            event,
            payload: payloadString,
            failedAt: Date.now(),
            finalError: errorMsg || 'Exhausted retry budget',
          },
          env.WEBHOOK_DLQ_STREAM_MAXLEN
        );
      }
    }
  } catch (metaErr) {
    logger.error({ err: metaErr }, 'Failed to update Webhook health metadata');
  }

  return {
    success: isSuccess,
    deliveryId,
    eventId,
    event,
    url: webhook.url,
    latencyMs,
    requestHeaders: headers,
    requestPayload: payload,
    responseStatus,
    responseHeaders,
    responseBody,
    error: errorMsg,
    attempt,
    deliveryRecordId: deliveryRecord?._id,
    delivery: deliveryRecord || {
      _id: deliveryRecord?._id,
      status: deliveryStatus,
      responseStatus,
      latencyMs,
      requestHeaders: headers,
      requestPayload: payload,
      responseHeaders,
      responseBody,
      error: errorMsg,
      attempt,
    },
  };
}

/**
 * Dispatches an event to all active webhooks subscribed to this event.
 * Runs asynchronously without blocking the caller.
 * @param {string} userId
 * @param {string} event
 * @param {Record<string, unknown>} data
 */
export async function dispatchEvent(userId, event, data) {
  if (!userId) return;

  try {
    // Map event aliases for backward compatibility
    const eventQuery = [event];
    if (event === 'link.clicked') eventQuery.push('click');
    if (event === 'click') eventQuery.push('link.clicked');
    if (event === 'security.abuse_flagged') eventQuery.push('abuse.flagged');
    if (event === 'abuse.flagged') eventQuery.push('security.abuse_flagged');

    const webhooks = await Webhook.find({
      user: userId,
      isActive: true,
      events: { $in: eventQuery },
    });

    for (const webhook of webhooks) {
      executeDelivery(webhook, event, data, 1).catch((err) =>
        logger.error({ err, webhookId: webhook._id, event }, 'Unhandled webhook dispatch error')
      );
    }
  } catch (err) {
    logger.error({ err, userId, event }, 'Failed to query webhooks for dispatch');
  }
}

/**
 * Triggers a live synthetic test event and returns the full HTTP exchange synchronously.
 */
export async function testWebhookEndpoint(webhookId, userId, eventType = 'endpoint.test') {
  const webhook = await Webhook.findOne({ _id: webhookId, user: userId });
  if (!webhook) {
    throw new Error('Webhook endpoint not found or unauthorized');
  }

  // Generate realistic sample payloads per event type
  let sampleData;
  switch (eventType) {
    case 'link.clicked':
      sampleData = {
        linkId: '6ab2805b12cad4d2d0337fc5',
        shortCode: 'demo2026',
        destinationUrl: 'https://example.com/product-showcase',
        timestamp: new Date().toISOString(),
        geo: {
          country: 'US',
          city: 'San Francisco',
          latitude: 37.7749,
          longitude: -122.4194,
        },
        client: {
          device: 'desktop',
          browser: 'Chrome',
          os: 'macOS',
        },
        referrer: 'https://twitter.com',
        utm: {
          source: 'twitter',
          medium: 'social',
          campaign: 'spring_launch',
        },
      };
      break;

    case 'link.created':
      sampleData = {
        linkId: '6ab2805b12cad4d2d0337fc5',
        shortCode: 'demo2026',
        originalUrl: 'https://example.com/product-showcase',
        title: 'Spring Product Showcase',
        createdAt: new Date().toISOString(),
      };
      break;

    case 'link.limit_reached':
      sampleData = {
        linkId: '6ab2805b12cad4d2d0337fc5',
        shortCode: 'demo2026',
        originalUrl: 'https://example.com/product-showcase',
        clicks: 100,
        maxClicks: 100,
        status: 'disabled',
      };
      break;

    case 'link.expired':
      sampleData = {
        linkId: '6ab2805b12cad4d2d0337fc5',
        shortCode: 'demo2026',
        originalUrl: 'https://example.com/product-showcase',
        expiredAt: new Date().toISOString(),
      };
      break;

    case 'security.abuse_flagged':
      sampleData = {
        linkId: '6ab2805b12cad4d2d0337fc5',
        shortCode: 'phish99',
        originalUrl: 'http://malware-sample.xyz',
        threatScore: 98,
        threatTypes: ['phishing', 'malware'],
        actionTaken: 'deactivated',
      };
      break;

    case 'endpoint.test':
    default:
      sampleData = {
        message: 'This is a test webhook event from Linkora.',
        testTimestamp: new Date().toISOString(),
        status: 'operational',
      };
      break;
  }

  // Execute single test delivery without retry loop
  return await executeDelivery(webhook, eventType, sampleData, 1);
}

/**
 * Replays a past webhook delivery using the exact payload and destination.
 */
export async function retryDelivery(deliveryId, userId) {
  const delivery = await WebhookDelivery.findOne({ _id: deliveryId, user: userId }).populate('webhook');
  if (!delivery) {
    throw new Error('Delivery record not found');
  }

  const webhook = delivery.webhook || (await Webhook.findById(delivery.webhook));
  if (!webhook) {
    throw new Error('Associated webhook endpoint no longer exists');
  }

  return await executeDelivery(
    webhook,
    delivery.event,
    delivery.requestPayload?.data || {},
    (delivery.attempt || 1) + 1
  );
}

/**
 * Periodically sweeps for expired links and dispatches link.expired events.
 */
export async function checkExpiredLinks() {
  const now = new Date();
  const expired = await Link.find({
    isActive: true,
    expiryDate: { $lte: now },
    expiryNotified: { $ne: true },
  }).lean();

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

/** @returns {import('node-cron').ScheduledTask} */
export function scheduleExpiryWebhookCheck() {
  return cron.schedule('*/15 * * * *', () => {
    checkExpiredLinks().catch((err) => logger.error({ err }, 'Scheduled expiry check failed'));
  });
}

export default {
  isSafeEndpointUrl,
  generateSignature,
  executeDelivery,
  dispatchEvent,
  testWebhookEndpoint,
  retryDelivery,
  checkExpiredLinks,
  scheduleExpiryWebhookCheck,
};
