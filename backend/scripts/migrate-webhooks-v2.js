#!/usr/bin/env node
/**
 * One-off migration to the durable webhook queue. Safe to re-run: every
 * step only touches documents still in the old shape.
 *
 * 1. Encrypts signing secrets stored in the clear (lib/webhookSecrets.js).
 * 2. Rewrites legacy subscription names (click, abuse.flagged) to their
 *    canonical types and drops duplicates.
 * 3. Converts delivery logs written by the old in-process sender into the
 *    WebhookDelivery shape. Each keeps its request payload as a
 *    WebhookEvent so it can still be replayed. Rows the old sender left
 *    'retrying' had their retry timer dropped by a restart or by this
 *    upgrade; they become 'cancelled' so a bulk replay can resend them.
 *
 * Usage: node scripts/migrate-webhooks-v2.js
 */
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import Webhook from '../src/models/Webhook.js';
import WebhookDelivery from '../src/models/WebhookDelivery.js';
import WebhookEvent from '../src/models/WebhookEvent.js';
import { encryptWebhookSecret, isEncryptedWebhookSecret } from '../src/lib/webhookSecrets.js';
import { normalizeEventType, normalizeSubscriptions } from '../src/lib/webhookEvents.js';

const LEGACY_STATUS = { success: 'succeeded', failed: 'failed', retrying: 'cancelled' };
const BATCH_SIZE = 500;

async function migrateWebhooks() {
  const stats = { scanned: 0, secretsEncrypted: 0, subscriptionsRewritten: 0 };
  const cursor = Webhook.find({}).select('+secret +previousSecret events').lean().cursor();
  for await (const hook of cursor) {
    stats.scanned += 1;
    const set = {};
    if (hook.secret && !isEncryptedWebhookSecret(hook.secret)) set.secret = encryptWebhookSecret(hook.secret);
    if (hook.previousSecret && !isEncryptedWebhookSecret(hook.previousSecret)) {
      set.previousSecret = encryptWebhookSecret(hook.previousSecret);
    }
    const { events } = normalizeSubscriptions(hook.events || []);
    const eventsChanged = events.length !== (hook.events || []).length || events.some((e, i) => e !== hook.events[i]);
    if (eventsChanged) set.events = events;

    if (Object.keys(set).length === 0) continue;
    await Webhook.updateOne({ _id: hook._id }, { $set: set });
    if (set.secret) stats.secretsEncrypted += 1;
    if (set.events) stats.subscriptionsRewritten += 1;
  }
  return stats;
}

function legacyAttempt(doc) {
  return {
    n: doc.attempt || 1,
    at: doc.createdAt,
    outcome: doc.status === 'success' ? 'success' : 'retryable',
    responseStatus: doc.responseStatus ?? null,
    latencyMs: doc.latencyMs || 0,
    error: doc.error ?? null,
    requestHeaders: doc.requestHeaders || {},
    responseHeaders: doc.responseHeaders || {},
    responseBody: doc.responseBody || '',
  };
}

async function migrateDeliveries() {
  const stats = { scanned: 0, converted: 0, orphaned: 0 };
  const workspaceByHook = new Map(
    (await Webhook.find({}).select('workspace').lean()).map((h) => [String(h._id), h.workspace])
  );

  // Old rows have no eventType; that's the marker for "not migrated yet".
  const cursor = WebhookDelivery.collection.find({ eventType: { $exists: false } }).batchSize(BATCH_SIZE);
  let ops = [];
  let events = [];
  const flush = async () => {
    if (events.length) {
      try {
        await WebhookEvent.collection.insertMany(events, { ordered: false });
      } catch (err) {
        if (err.code !== 11000 && !err.writeErrors?.every((e) => e.code === 11000)) throw err;
      }
    }
    if (ops.length) await WebhookDelivery.collection.bulkWrite(ops, { ordered: false });
    ops = [];
    events = [];
  };

  for await (const doc of cursor) {
    stats.scanned += 1;
    const workspace = workspaceByHook.get(String(doc.webhook)) || doc.workspace;
    if (!workspace) {
      // Its endpoint is gone and the row can't be attributed; TTL removes it.
      stats.orphaned += 1;
      continue;
    }
    const type = normalizeEventType(doc.event) || 'endpoint.test';
    const payload = doc.requestPayload || {};
    const eventId = typeof payload.id === 'string' && payload.id.startsWith('evt_') ? payload.id : `evt_legacy_${doc._id}`;
    events.push({ _id: eventId, workspace, type, data: payload.data || {}, createdAt: doc.createdAt });

    const status = LEGACY_STATUS[doc.status] || 'failed';
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            workspace,
            event: eventId,
            eventType: type,
            // The old sender minted a new event id per attempt, so every
            // legacy row already has its own (event, webhook) pair.
            kind: type === 'endpoint.test' ? 'test' : 'live',
            status,
            attemptCount: doc.attempt || 1,
            maxAttempts: doc.attempt || 1,
            nextAttemptAt: null,
            lockedUntil: null,
            lockedBy: null,
            completedAt: doc.updatedAt || doc.createdAt,
            cancelReason: status === 'cancelled' ? 'retry dropped by the pre-queue sender; replay to resend' : null,
            lastAttemptAt: doc.createdAt,
            lastResponseStatus: doc.responseStatus ?? null,
            lastLatencyMs: doc.latencyMs ?? null,
            lastError: doc.error ?? null,
            attempts: [legacyAttempt(doc)],
          },
          $unset: {
            user: '',
            responseStatus: '',
            requestHeaders: '',
            requestPayload: '',
            responseHeaders: '',
            responseBody: '',
            latencyMs: '',
            attempt: '',
            error: '',
          },
        },
      },
    });
    stats.converted += 1;
    if (ops.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return stats;
}

/**
 * Runs against the already-open Mongo connection (exported for tests).
 */
export async function migrateWebhooksV2() {
  const webhooks = await migrateWebhooks();
  const deliveries = await migrateDeliveries();
  return { webhooks, deliveries };
}

const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  mongoose
    .connect(env.MONGODB_URI)
    .then(migrateWebhooksV2)
    .then((result) => {
      logger.info(result, 'Webhook v2 migration complete');
      return mongoose.disconnect();
    })
    .catch((err) => {
      logger.error({ err }, 'Webhook v2 migration failed');
      process.exit(1);
    });
}
