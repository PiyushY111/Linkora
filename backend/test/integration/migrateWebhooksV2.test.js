import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import Webhook from '../../src/models/Webhook.js';
import WebhookDelivery from '../../src/models/WebhookDelivery.js';
import WebhookEvent from '../../src/models/WebhookEvent.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { decryptWebhookSecret, isEncryptedWebhookSecret } from '../../src/lib/webhookSecrets.js';
import { replayFailedDeliveries } from '../../src/services/webhookService.js';
import { migrateWebhooksV2 } from '../../scripts/migrate-webhooks-v2.js';

let user;
let workspace;
let hookId;

beforeAll(async () => {
  await connectTestDb();
  ({ user, workspace } = await createTestUser());

  // Documents exactly as the pre-queue code wrote them (raw driver writes,
  // bypassing today's schema).
  const { insertedId } = await Webhook.collection.insertOne({
    user: user._id,
    workspace: workspace._id,
    url: 'https://example.com/hook',
    events: ['click', 'link.clicked', 'abuse.flagged'],
    secret: 'whsec_plaintextlegacy',
    isActive: true,
    createdAt: new Date(),
  });
  hookId = insertedId;
  const base = { webhook: hookId, user: user._id, url: 'https://example.com/hook', latencyMs: 12, createdAt: new Date(), updatedAt: new Date() };
  await WebhookDelivery.collection.insertMany([
    { ...base, event: 'link.created', status: 'success', responseStatus: 200, attempt: 1, requestPayload: { id: `evt_${'a'.repeat(24)}`, event: 'link.created', data: { linkId: 'x' } } },
    { ...base, event: 'click', status: 'retrying', responseStatus: 500, attempt: 2, error: 'HTTP 500', requestPayload: { id: `evt_${'b'.repeat(24)}`, event: 'click', data: { linkId: 'y' } } },
    { ...base, event: 'endpoint.test', status: 'failed', responseStatus: null, attempt: 1, error: 'refused', requestPayload: {} },
  ]);
});

afterAll(async () => {
  await WebhookDelivery.deleteMany({ webhook: hookId });
  await WebhookEvent.deleteMany({ workspace: workspace._id });
  await Webhook.deleteMany({ _id: hookId });
  await mongoose.model('Workspace').deleteOne({ _id: workspace._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('scripts/migrate-webhooks-v2.js', () => {
  it('encrypts secrets, canonicalises subscriptions and converts legacy deliveries; re-running is a no-op', async () => {
    const first = await migrateWebhooksV2();
    assert.ok(first.webhooks.secretsEncrypted >= 1);
    assert.ok(first.deliveries.converted >= 3);

    const hook = await Webhook.findById(hookId).select('+secret').lean();
    assert.ok(isEncryptedWebhookSecret(hook.secret));
    assert.strictEqual(decryptWebhookSecret(hook.secret), 'whsec_plaintextlegacy');
    assert.deepStrictEqual(hook.events, ['link.clicked', 'security.abuse_flagged']);

    const deliveries = await WebhookDelivery.find({ webhook: hookId }).sort({ lastResponseStatus: -1 }).lean();
    const byType = Object.fromEntries(deliveries.map((d) => [d.eventType, d]));
    assert.strictEqual(byType['link.created'].status, 'succeeded');
    assert.strictEqual(byType['link.clicked'].status, 'cancelled');
    assert.match(byType['link.clicked'].cancelReason, /replay/);
    assert.strictEqual(byType['link.clicked'].attempts[0].responseStatus, 500);
    assert.strictEqual(byType['endpoint.test'].kind, 'test');
    assert.strictEqual(byType['link.created'].user, undefined);
    assert.strictEqual(byType['link.created'].requestPayload, undefined);

    const event = await WebhookEvent.findById(`evt_${'b'.repeat(24)}`).lean();
    assert.deepStrictEqual(event.data, { linkId: 'y' });

    // The dropped retry is recoverable through a bulk replay.
    const replay = await replayFailedDeliveries(hookId, workspace._id, { since: new Date(Date.now() - 60_000), statuses: ['cancelled'] });
    assert.strictEqual(replay.queued, 1);

    const second = await migrateWebhooksV2();
    assert.strictEqual(second.webhooks.secretsEncrypted, 0);
    assert.strictEqual(second.webhooks.subscriptionsRewritten, 0);
    assert.strictEqual(second.deliveries.converted, 0);
  });
});
