import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, resetRateLimits } from '../helpers/testUtils.js';
import { startWebhookReceiver } from '../helpers/webhookReceiver.js';
import ApiKey from '../../src/models/ApiKey.js';
import Webhook from '../../src/models/Webhook.js';
import WebhookDelivery from '../../src/models/WebhookDelivery.js';
import WebhookEvent from '../../src/models/WebhookEvent.js';
import Workspace from '../../src/models/Workspace.js';
import User from '../../src/models/User.js';
import { closeRedis } from '../../src/services/cacheService.js';

let owner;
let member;
let receiver;

async function keyFor({ user, workspace }, scopes) {
  const raw = `lnk_test_${crypto.randomBytes(24).toString('hex')}`;
  await ApiKey.create({
    user: user._id,
    workspace: workspace._id,
    name: `webhook key ${scopes.join(',')}`,
    keyHash: crypto.createHash('sha256').update(raw).digest('hex'),
    prefix: raw.slice(0, 12),
    maskedKey: `${raw.slice(0, 12)}...${raw.slice(-4)}`,
    lastFour: raw.slice(-4),
    scopes,
  });
  return raw;
}

beforeAll(async () => {
  await connectTestDb();
  owner = await createTestUser({ name: 'Webhook API Owner' });
  member = await createTestUser({ name: 'Webhook API Creator' });
  // The creator-role member acts in the owner's workspace.
  await Workspace.updateOne({ _id: owner.workspace._id }, { $push: { members: { user: member.user._id, role: 'creator' } } });
  member = { ...member, workspace: owner.workspace };
  receiver = await startWebhookReceiver();
  await resetRateLimits(['public-api', 'webhook-test']);
});

afterAll(async () => {
  const hooks = await Webhook.find({ workspace: owner.workspace._id }).distinct('_id');
  await WebhookDelivery.deleteMany({ webhook: { $in: hooks } });
  await WebhookEvent.deleteMany({ workspace: owner.workspace._id });
  await Webhook.deleteMany({ workspace: owner.workspace._id });
  await ApiKey.deleteMany({ user: { $in: [owner.user._id, member.user._id] } });
  await Workspace.deleteMany({ _id: { $in: [owner.workspace._id] } });
  await User.deleteMany({ _id: { $in: [owner.user._id, member.user._id] } });
  await mongoose.model('Organization').deleteMany({ owner: { $in: [owner.user._id, member.user._id] } });
  await receiver.close();
  await disconnectTestDb();
  await closeRedis();
});

describe('public API /v1/webhooks', () => {
  it('manages endpoints with webhooks:write and reads them with webhooks:read', async () => {
    const writeKey = await keyFor(owner, ['webhooks:read', 'webhooks:write']);
    const created = await request(app)
      .post('/api/public/v1/webhooks')
      .set('x-api-key', writeKey)
      .send({ url: receiver.url, events: ['link.created'] });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    assert.match(created.body.secret, /^whsec_/);

    const readKey = await keyFor(owner, ['webhooks:read']);
    const listed = await request(app).get('/api/public/v1/webhooks').set('x-api-key', readKey);
    assert.strictEqual(listed.status, 200);
    assert.strictEqual(listed.body.webhooks.length, 1);

    const test = await request(app).post(`/api/public/v1/webhooks/${created.body.webhook._id}/test`).set('x-api-key', writeKey).send({});
    assert.strictEqual(test.status, 200);
    assert.strictEqual(test.body.delivery.status, 'succeeded');

    const paused = await request(app)
      .patch(`/api/public/v1/webhooks/${created.body.webhook._id}`)
      .set('x-api-key', writeKey)
      .send({ isActive: false });
    assert.strictEqual(paused.status, 200);
    assert.strictEqual(paused.body.webhook.isActive, false);
  });

  it('refuses writes to a read-only key and anything to a key without webhook scopes', async () => {
    const readKey = await keyFor(owner, ['webhooks:read']);
    const denied = await request(app)
      .post('/api/public/v1/webhooks')
      .set('x-api-key', readKey)
      .send({ url: receiver.url, events: ['link.created'] });
    assert.strictEqual(denied.status, 403);
    assert.match(denied.body.message, /webhooks:write/);

    const linksKey = await keyFor(owner, ['links:read']);
    assert.strictEqual((await request(app).get('/api/public/v1/webhooks').set('x-api-key', linksKey)).status, 403);
  });

  it("refuses a correctly-scoped key whose creator isn't a workspace admin", async () => {
    const key = await keyFor(member, ['webhooks:read', 'webhooks:write']);
    const res = await request(app).get('/api/public/v1/webhooks').set('x-api-key', key);
    assert.strictEqual(res.status, 403);
  });

  it('lists webhook paths in the OpenAPI document', async () => {
    const spec = await request(app).get('/api/public/v1/openapi.json');
    assert.ok(spec.body.paths['/webhooks']);
    assert.ok(spec.body.paths['/webhooks/{id}/deliveries/{deliveryId}/replay']);
  });
});
