import dns from 'dns';
import { Agent, fetch as undiciFetch } from 'undici';
import Webhook from '../models/Webhook.js';
import WebhookDelivery, { MAX_RECORDED_ATTEMPTS, RESPONSE_PREVIEW_BYTES } from '../models/WebhookDelivery.js';
import WebhookEvent from '../models/WebhookEvent.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { isCloudMetadataHost, isDialable } from '../lib/netPolicy.js';
import { activeSigningSecrets } from '../lib/webhookSecrets.js';
import { signPayload } from '../lib/webhookSignature.js';
import { webhookDeliveriesTotal, webhookAttemptDurationSeconds } from '../middleware/metrics.js';

/**
 * Executes and records webhook delivery attempts. This is the only module
 * that talks HTTP to a customer endpoint; the worker (workers/
 * webhookWorker.js) and the dashboard's synchronous test/replay paths both
 * go through performDelivery().
 */

// Wait before attempt n+1 after attempt n fails; ~23 hours end to end.
export const RETRY_SCHEDULE_MS = Object.freeze([
  5_000,
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
  60 * 60_000,
  3 * 60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
]);
export const MAX_ATTEMPTS = RETRY_SCHEDULE_MS.length + 1;
const JITTER_RATIO = 0.2;
const MAX_RETRY_AFTER_MS = 60 * 60_000;

// Circuit breaker: open after this many consecutive failures, for a cooldown
// that doubles with every trip up to the cap.
export const CIRCUIT_OPEN_THRESHOLD = 5;
export const CIRCUIT_BASE_COOLDOWN_MS = 60_000;
export const CIRCUIT_MAX_COOLDOWN_MS = 30 * 60_000;
// Deliveries that arrive while another one is probing a half-open circuit.
const HALF_OPEN_HOLD_MS = 15_000;

// How much of a response we'll read at all; the stored preview is smaller.
const MAX_RESPONSE_READ_BYTES = 64 * 1024;
export const DELIVERY_LEASE_MS = 60_000;

const USER_AGENT = 'Linkora-Webhooks/2.0 (+https://linkora.dev/docs/webhooks)';

function isBlockedWebhookAddress(ip) {
  return !isDialable(ip, { allowPrivate: env.NODE_ENV !== 'production' });
}

/**
 * Re-resolves `hostname` and returns the first address that passes the
 * SSRF policy, throwing if none do. Registration-time validation isn't
 * enough on its own: an attacker can point DNS at a safe IP while
 * registering and at an internal one before the next delivery (DNS
 * rebinding), so this runs immediately before every attempt.
 *
 * `lookup` is injectable so tests can simulate exactly that.
 */
export async function resolveSafeDeliveryAddress(hostname, lookup = dns.promises.lookup) {
  if (isCloudMetadataHost(hostname)) {
    throw Object.assign(new Error('Destination is a blocked cloud metadata address'), { fatal: true });
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const safe = addresses.find((addr) => !isBlockedWebhookAddress(addr.address));
  if (!safe) {
    throw Object.assign(new Error('Destination resolves only to blocked or private addresses'), { fatal: true });
  }
  return safe;
}

/**
 * An undici Agent whose connector ignores DNS at connect time and dials the
 * single, already-validated address, closing the gap between "we checked
 * this hostname" and "we connected to this hostname".
 */
function buildPinnedDispatcher(address) {
  return new Agent({
    connect: {
      // Node's happy-eyeballs connect asks for every address (`all: true`)
      // and expects an array back; plain connects expect (address, family).
      lookup: (_hostname, options, callback) => {
        if (options?.all) return callback(null, [{ address: address.address, family: address.family }]);
        return callback(null, address.address, address.family);
      },
    },
  });
}

/**
 * Reads at most MAX_RESPONSE_READ_BYTES of a response body, then cancels
 * the stream. A hostile endpoint can't make us buffer an unbounded body.
 */
async function readBodyCapped(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX_RESPONSE_READ_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks).subarray(0, MAX_RESPONSE_READ_BYTES).toString('utf8');
}

function parseRetryAfterMs(headerValue) {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds, 0) * 1000, MAX_RETRY_AFTER_MS);
  const at = Date.parse(headerValue);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_AFTER_MS);
}

/**
 * Turns a failed fetch into a message a workspace admin can act on. Never
 * includes anything from the response, only the failure class.
 */
function describeNetworkError(err, timeoutMs) {
  // With happy-eyeballs the socket error is an AggregateError of per-address
  // failures; any of them names the class of failure.
  const cause = err.cause || {};
  const code = cause.code || cause.errors?.[0]?.code || err.code || '';
  if (code === 'ECONNREFUSED') return 'Connection refused: nothing is listening at the endpoint';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS resolution failed for the endpoint hostname';
  if (code === 'ECONNRESET') return 'Connection reset by the endpoint';
  if (code === 'CERT_HAS_EXPIRED' || code.startsWith('ERR_TLS') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return `TLS handshake failed (${code})`;
  }
  if (err.name === 'TimeoutError' || code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'ETIMEDOUT') {
    return `Endpoint did not respond within ${timeoutMs} ms`;
  }
  return code ? `Request failed (${code})` : 'Request failed';
}

/**
 * The exact bytes and headers of one attempt. Signed freshly per attempt
 * (the timestamp must be current for the receiver's replay window), while
 * the event id and body stay the same across attempts.
 * @param {{ _id: unknown, secret: string, previousSecret?: string, previousSecretExpiresAt?: Date }} webhook
 * @param {{ _id: string, type: string, workspace: unknown, data: unknown, createdAt: Date }} event
 * @param {{ _id: unknown, attemptCount: number }} delivery
 */
export function buildAttemptRequest(webhook, event, delivery) {
  const payload = {
    id: event._id,
    type: event.type,
    createdAt: new Date(event.createdAt).toISOString(),
    workspaceId: String(event.workspace),
    data: event.data,
  };
  const body = JSON.stringify(payload);
  const { timestamp, header } = signPayload(body, activeSigningSecrets(webhook));
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'Linkora-Event-Id': event._id,
    'Linkora-Event': event.type,
    'Linkora-Delivery': String(delivery._id),
    'Linkora-Attempt': String(delivery.attemptCount + 1),
    'Linkora-Timestamp': String(timestamp),
    'Linkora-Signature': header,
  };
  return { payload, body, headers };
}

/**
 * One HTTP attempt. Never throws: every failure becomes an outcome.
 * @returns {Promise<{ outcome: 'success' | 'retryable' | 'fatal', responseStatus: number | null, responseHeaders: Record<string, string>, responseBody: string, error: string | null, latencyMs: number, retryAfterMs: number | null, endpointGone: boolean }>}
 */
export async function sendAttempt(url, body, headers, { lookup = dns.promises.lookup, timeoutMs = env.WEBHOOK_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  const result = {
    outcome: 'retryable',
    responseStatus: null,
    responseHeaders: {},
    responseBody: '',
    error: null,
    latencyMs: 0,
    retryAfterMs: null,
    endpointGone: false,
  };
  let dispatcher = null;

  try {
    const address = await resolveSafeDeliveryAddress(new URL(url).hostname, lookup);
    dispatcher = buildPinnedDispatcher(address);

    // undici's own fetch, not Node's global one, so it always shares an
    // undici version with the Agent above (a mismatch throws instead of
    // pinning anything).
    const response = await undiciFetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher,
      // A malicious endpoint could otherwise 3xx this request to an
      // internal address after passing the SSRF check on its own URL.
      redirect: 'manual',
    });

    result.responseStatus = response.status;
    response.headers.forEach((value, key) => {
      result.responseHeaders[key] = value;
    });
    result.responseBody = (await readBodyCapped(response)).slice(0, RESPONSE_PREVIEW_BYTES);

    const isRedirect = response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
    if (isRedirect) {
      result.outcome = 'fatal';
      result.error = 'Endpoint responded with a redirect, which webhooks never follow';
    } else if (response.ok) {
      result.outcome = 'success';
    } else if (response.status === 410) {
      result.outcome = 'fatal';
      result.endpointGone = true;
      result.error = 'Endpoint returned HTTP 410 Gone; the subscription has been disabled';
    } else {
      result.outcome = 'retryable';
      result.error = `Endpoint returned HTTP ${response.status}`;
      if (response.status === 429 || response.status === 503) {
        result.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      }
    }
  } catch (err) {
    result.outcome = err.fatal ? 'fatal' : 'retryable';
    result.error = err.fatal ? err.message : describeNetworkError(err, timeoutMs);
  } finally {
    if (dispatcher) await dispatcher.close().catch(() => {});
  }

  result.latencyMs = Date.now() - startedAt;
  return result;
}

function withJitter(ms) {
  const spread = ms * JITTER_RATIO;
  return Math.round(ms - spread + Math.random() * 2 * spread);
}

/** Delay before the next attempt after `attemptCount` attempts have failed. */
export function backoffAfter(attemptCount, retryAfterMs = null) {
  const scheduled = RETRY_SCHEDULE_MS[Math.min(attemptCount, RETRY_SCHEDULE_MS.length) - 1] ?? RETRY_SCHEDULE_MS[0];
  return Math.max(withJitter(scheduled), retryAfterMs || 0);
}

function circuitCooldownMs(trips) {
  return Math.min(CIRCUIT_BASE_COOLDOWN_MS * 2 ** Math.max(trips, 0), CIRCUIT_MAX_COOLDOWN_MS);
}

/**
 * Whether a delivery may be attempted now given the endpoint's circuit, and
 * if not, when to look again. A half-open circuit lets exactly one probe
 * through (the atomic open->half_open transition here is that gate).
 * @returns {Promise<{ proceed: boolean, holdUntil?: Date }>}
 */
async function checkCircuit(webhook, now) {
  const circuit = webhook.circuit || {};
  if (circuit.state === 'closed' || !circuit.state) return { proceed: true };

  if (circuit.state === 'open') {
    if (circuit.openUntil && circuit.openUntil > now) {
      return { proceed: false, holdUntil: new Date(circuit.openUntil.getTime() + withJitter(1000)) };
    }
    const probe = await Webhook.updateOne(
      { _id: webhook._id, 'circuit.state': 'open' },
      { $set: { 'circuit.state': 'half_open', 'circuit.openUntil': now } }
    );
    if (probe.modifiedCount === 1) return { proceed: true };
  }

  if (circuit.state === 'half_open') {
    // A probe whose worker died never reports back; once its lease has
    // certainly expired, let another delivery take over as the probe.
    const staleProbe = await Webhook.updateOne(
      { _id: webhook._id, 'circuit.state': 'half_open', 'circuit.openUntil': { $lte: new Date(now.getTime() - DELIVERY_LEASE_MS) } },
      { $set: { 'circuit.openUntil': now } }
    );
    if (staleProbe.modifiedCount === 1) return { proceed: true };
  }
  // A probe is in flight, or we lost the race to become it: hold briefly.
  return { proceed: false, holdUntil: new Date(now.getTime() + withJitter(HALF_OPEN_HOLD_MS)) };
}

/**
 * Folds an attempt into the endpoint's health: closes the circuit on
 * success; counts failures, trips the breaker, and disables the endpoint
 * after WEBHOOK_AUTO_DISABLE_AFTER_HOURS of unbroken failure or a 410.
 */
async function recordEndpointHealth(webhook, attempt, now) {
  if (attempt.outcome === 'success') {
    await Webhook.updateOne(
      { _id: webhook._id },
      {
        $set: {
          'circuit.state': 'closed',
          'circuit.consecutiveFailures': 0,
          'circuit.trips': 0,
          'circuit.openedAt': null,
          'circuit.openUntil': null,
          failingSince: null,
          lastDeliveryStatus: 'success',
          lastDeliveredAt: now,
          lastSuccessAt: now,
        },
      }
    );
    return;
  }

  const updated = await Webhook.findByIdAndUpdate(
    webhook._id,
    {
      $inc: { 'circuit.consecutiveFailures': 1 },
      $set: { lastDeliveryStatus: 'failed', lastDeliveredAt: now },
    },
    { new: true }
  );
  if (!updated) return;
  // Only the first failure of a run sets failingSince; later ones keep it.
  await Webhook.updateOne({ _id: webhook._id, failingSince: null }, { $set: { failingSince: now } });

  const circuit = updated.circuit || {};
  const shouldTrip =
    circuit.state === 'half_open' || (circuit.state !== 'open' && circuit.consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD);
  if (shouldTrip) {
    const cooldown = circuitCooldownMs(circuit.trips);
    await Webhook.updateOne(
      { _id: webhook._id },
      {
        $set: { 'circuit.state': 'open', 'circuit.openedAt': now, 'circuit.openUntil': new Date(now.getTime() + cooldown) },
        $inc: { 'circuit.trips': 1 },
      }
    );
    logger.warn({ webhookId: webhook._id, cooldownMs: cooldown, trips: circuit.trips + 1 }, 'Webhook circuit opened');
  }

  const failingSince = updated.failingSince || now;
  const failingForMs = now.getTime() - failingSince.getTime();
  const disableAfterMs = env.WEBHOOK_AUTO_DISABLE_AFTER_HOURS * 60 * 60_000;
  if (attempt.endpointGone || failingForMs >= disableAfterMs) {
    await disableWebhook(webhook._id, attempt.endpointGone ? 'gone' : 'failing', now);
  }
}

/**
 * Turns an endpoint off and cancels everything still queued for it.
 * @param {unknown} webhookId
 * @param {'failing' | 'gone' | 'manual'} reason
 */
export async function disableWebhook(webhookId, reason, now = new Date()) {
  const result = await Webhook.updateOne(
    { _id: webhookId, isActive: true },
    { $set: { isActive: false, disabledAt: now, disabledReason: reason } }
  );
  if (result.modifiedCount === 1) {
    logger.warn({ webhookId, reason }, 'Webhook disabled');
    await cancelPendingDeliveries(webhookId, `endpoint disabled (${reason})`);
  }
}

/** @param {unknown} webhookId */
export async function cancelPendingDeliveries(webhookId, reason) {
  await WebhookDelivery.updateMany(
    { webhook: webhookId, status: { $in: ['pending', 'in_flight'] }, kind: { $ne: 'test' } },
    { $set: { status: 'cancelled', cancelReason: reason, completedAt: new Date(), nextAttemptAt: null } }
  );
}

async function cancelDelivery(delivery, reason) {
  await WebhookDelivery.updateOne(
    { _id: delivery._id },
    { $set: { status: 'cancelled', cancelReason: reason, completedAt: new Date(), nextAttemptAt: null, lockedUntil: null, lockedBy: null } }
  );
  webhookDeliveriesTotal.inc({ outcome: 'cancelled' });
}

async function holdDelivery(delivery, until) {
  await WebhookDelivery.updateOne(
    { _id: delivery._id },
    { $set: { status: 'pending', nextAttemptAt: until, lockedUntil: null, lockedBy: null } }
  );
}

/**
 * Attempts one claimed delivery end to end: re-reads the endpoint (so a
 * subscription deleted, paused or rotated since enqueue is honoured),
 * consults the circuit breaker, sends, records the attempt on the delivery
 * and folds it into endpoint health, then finishes or schedules the next
 * attempt. Test deliveries skip the breaker and the health bookkeeping.
 *
 * @param {import('mongoose').Document & { _id: unknown, webhook: unknown, event: string, kind: string, attemptCount: number, maxAttempts: number }} delivery a claimed (in_flight) delivery
 * @param {{ lookup?: typeof dns.promises.lookup, now?: Date }} [options]
 * @returns {Promise<{ status: string, attempt: object | null }>}
 */
export async function performDelivery(delivery, { lookup, now = new Date() } = {}) {
  const webhook = await Webhook.findById(delivery.webhook).select('+secret +previousSecret');
  if (!webhook) {
    await cancelDelivery(delivery, 'endpoint deleted');
    return { status: 'cancelled', attempt: null };
  }
  if (!webhook.isActive && delivery.kind !== 'test') {
    await cancelDelivery(delivery, `endpoint ${webhook.disabledReason === 'manual' || !webhook.disabledReason ? 'paused' : 'disabled'}`);
    return { status: 'cancelled', attempt: null };
  }

  if (delivery.kind !== 'test') {
    const gate = await checkCircuit(webhook, now);
    if (!gate.proceed) {
      await holdDelivery(delivery, gate.holdUntil);
      return { status: 'pending', attempt: null };
    }
  }

  const event = await WebhookEvent.findById(delivery.event).lean();
  if (!event) {
    await cancelDelivery(delivery, 'event expired');
    return { status: 'cancelled', attempt: null };
  }

  const { body, headers } = buildAttemptRequest(webhook, event, delivery);
  const endTimer = webhookAttemptDurationSeconds.startTimer();
  const result = await sendAttempt(webhook.url, body, headers, { lookup });
  endTimer({ outcome: result.outcome });

  const attemptNumber = delivery.attemptCount + 1;
  const attempt = {
    n: attemptNumber,
    at: now,
    outcome: result.outcome,
    responseStatus: result.responseStatus,
    latencyMs: result.latencyMs,
    error: result.error,
    requestHeaders: headers,
    responseHeaders: result.responseHeaders,
    responseBody: result.responseBody,
  };

  const exhausted = attemptNumber >= delivery.maxAttempts;
  let status;
  let nextAttemptAt = null;
  if (result.outcome === 'success') status = 'succeeded';
  else if (result.outcome === 'fatal' || exhausted) status = 'failed';
  else {
    status = 'pending';
    nextAttemptAt = new Date(now.getTime() + backoffAfter(attemptNumber, result.retryAfterMs));
  }

  await WebhookDelivery.updateOne(
    { _id: delivery._id },
    {
      $set: {
        status,
        nextAttemptAt,
        lockedUntil: null,
        lockedBy: null,
        attemptCount: attemptNumber,
        lastAttemptAt: now,
        lastResponseStatus: result.responseStatus,
        lastLatencyMs: result.latencyMs,
        lastError: result.error,
        completedAt: status === 'pending' ? null : now,
      },
      $push: { attempts: { $each: [attempt], $slice: -MAX_RECORDED_ATTEMPTS } },
    }
  );
  webhookDeliveriesTotal.inc({ outcome: status === 'pending' ? 'retry_scheduled' : status });

  if (delivery.kind !== 'test') {
    try {
      await recordEndpointHealth(webhook, result, now);
    } catch (err) {
      logger.error({ err, webhookId: webhook._id }, 'Failed to update webhook endpoint health');
    }
  }

  if (status === 'failed') {
    logger.warn({ webhookId: webhook._id, deliveryId: delivery._id, attempts: attemptNumber, error: result.error }, 'Webhook delivery failed');
  }

  return { status, attempt };
}

export default { performDelivery, sendAttempt, buildAttemptRequest, backoffAfter, disableWebhook, cancelPendingDeliveries };
