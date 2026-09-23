import crypto from 'crypto';
import dns from 'dns';
import cron from 'node-cron';
import { Agent, fetch as undiciFetch } from 'undici';
import Webhook from '../models/Webhook.js';
import WebhookDelivery from '../models/WebhookDelivery.js';
import Link from '../models/Link.js';
import { addToStream } from './eventStreamService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Exponential backoff delays: 10s, 1m, 5m, 30m, 2h
const RETRY_DELAYS_MS = [10000, 60000, 300000, 1800000, 7200000];

const WEBHOOK_METADATA_IPS = new Set(['169.254.169.254']);

function isPrivateOrLoopbackIp(ip) {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('127.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  );
}

/**
 * The single source of truth for "is this IP okay to send a webhook to",
 * shared by registration-time validation (isSafeEndpointUrl) and the
 * delivery-time re-check below — so the two can never drift apart. Cloud
 * metadata is blocked unconditionally; private/loopback ranges are blocked
 * only in production, preserving the local-testing convenience of pointing
 * a webhook at this app's own built-in echo endpoint in development.
 */
function isBlockedWebhookAddress(ip) {
  if (WEBHOOK_METADATA_IPS.has(ip)) return true;
  return env.NODE_ENV === 'production' && isPrivateOrLoopbackIp(ip);
}

/**
 * Validates endpoint URL and guards against Server-Side Request Forgery (SSRF).
 * Blocks loopback, private RFC 1918, link-local, and cloud metadata addresses.
 */
export async function isSafeEndpointUrl(urlStr, { lookup = dns.promises.lookup } = {}) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: 'URL must use HTTP or HTTPS protocol' };
    }

    const host = parsed.hostname.toLowerCase();

    // Block cloud metadata services unconditionally (by hostname, ahead of
    // the DNS lookup below which only checks the resolved IP).
    if (
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host.endsWith('.metadata.google.internal')
    ) {
      return { safe: false, reason: 'Access to cloud metadata endpoints is forbidden' };
    }

    const lookupResult = await lookup(host);
    if (isBlockedWebhookAddress(lookupResult.address)) {
      return { safe: false, reason: 'This destination resolves to a blocked/private address' };
    }

    return { safe: true, ip: lookupResult.address };
  } catch (err) {
    return { safe: false, reason: `URL resolution failed: ${err.message}` };
  }
}

/**
 * Re-resolves `hostname` and returns the first address that passes the same
 * SSRF policy as isSafeEndpointUrl, throwing if none do. isSafeEndpointUrl
 * only runs at registration time; without a second check *immediately*
 * before each delivery, an attacker can point DNS at a safe IP during
 * registration and then repoint it at an internal address before the next
 * delivery — a classic DNS-rebinding bypass of a validate-then-fetch
 * pattern.
 *
 * `lookup` is injectable so tests can simulate exactly that rebinding
 * scenario (a hostname that resolves safely once and privately the next).
 */
async function resolveSafeDeliveryAddress(hostname, lookup = dns.promises.lookup) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const safe = addresses.find((addr) => !isBlockedWebhookAddress(addr.address));
  if (!safe) {
    throw new Error(`Destination "${hostname}" resolves only to blocked/private addresses`);
  }
  return safe;
}

/**
 * Builds an undici Agent whose connector ignores whatever DNS says at
 * connect time and always dials the single, already-validated address —
 * closing the gap between "we checked this hostname" and "we connected to
 * this hostname" that a plain re-check-then-fetch still leaves open.
 */
function buildPinnedDispatcher(address) {
  return new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, address.address, address.family);
      },
    },
  });
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
 * Executes a single HTTP webhook delivery attempt, records telemetry and response preview.
 */
export async function executeDelivery(
  webhook,
  event,
  data,
  attempt = 1,
  existingDeliveryId = null,
  { lookup = dns.promises.lookup } = {}
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
    'User-Agent': 'Linkora-Webhooks/1.0 (+https://linkora.dev)',
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
  let pinnedDispatcher = null;

  try {
    const targetHostname = new URL(webhook.url).hostname;
    const safeAddress = await resolveSafeDeliveryAddress(targetHostname, lookup);
    pinnedDispatcher = buildPinnedDispatcher(safeAddress);

    // Uses undici's own fetch (not Node's global fetch) so it always shares
    // an undici version with the Agent/dispatcher below — a version
    // mismatch between Node's bundled undici and a globally-fetched
    // dispatcher throws (UND_ERR_INVALID_ARG) rather than pinning anything.
    const response = await undiciFetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: AbortSignal.timeout(10000), // 10 second timeout
      dispatcher: pinnedDispatcher,
      // A malicious endpoint could otherwise 3xx this request to an
      // internal address after passing the SSRF check on its own URL.
      redirect: 'manual',
    });

    responseStatus = response.status;
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const rawText = await response.text();
    responseBody = rawText ? rawText.slice(0, 2048) : ''; // Store up to 2KB preview

    const isRedirect = response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
    if (isRedirect) {
      errorMsg = 'Endpoint attempted to redirect the webhook request, which is not permitted';
    } else if (response.ok) {
      isSuccess = true;
    } else {
      errorMsg = `Endpoint returned HTTP status ${response.status} (${response.statusText || 'Error'})`;
    }
  } catch (err) {
    const cause = err.cause;
    let detail = '';
    if (cause) {
      detail = cause.code
        ? `${cause.code} - ${cause.message || cause.code}`
        : cause.message || String(cause);
    }
    if (detail.includes('ECONNREFUSED')) {
      errorMsg = `Connection refused (ECONNREFUSED): No active server listening at ${webhook.url}`;
    } else if (detail.includes('ETIMEDOUT') || err.name === 'TimeoutError') {
      errorMsg = `Request timed out after 10,000ms: Destination did not respond in time`;
    } else if (detail.includes('ENOTFOUND')) {
      errorMsg = `DNS resolution failed (ENOTFOUND): Hostname could not be found`;
    } else {
      errorMsg = detail ? `${err.message}: ${detail}` : err.message || 'Network request failed';
    }
  } finally {
    if (pinnedDispatcher) {
      await pinnedDispatcher.close().catch(() => {});
    }
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
        message: 'This is a test webhook event from Linkora Enterprise.',
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

export function scheduleExpiryWebhookCheck() {
  cron.schedule('*/15 * * * *', () => {
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
