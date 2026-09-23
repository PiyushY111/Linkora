import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import { closeRedis } from '../../src/services/cacheService.js';

let owner;
let ownerToken;
let intruder;
let intruderToken;

beforeAll(async () => {
  await connectTestDb();
  ({ user: owner, token: ownerToken } = await createTestUser());
  ({ user: intruder, token: intruderToken } = await createTestUser());
});

afterAll(async () => {
  await Link.deleteMany({ user: { $in: [owner._id, intruder._id] } });
  await mongoose.model('User').deleteMany({ _id: { $in: [owner._id, intruder._id] } });
  await disconnectTestDb();
  await closeRedis();
});

describe('redirect-target validation on create + update (dashboard API)', () => {
  it('rejects a private-IP iosRedirect at creation', async () => {
    const res = await request(app)
      .post('/api/links')
      .set(authHeader(ownerToken))
      .send({ originalUrl: 'https://example.com', iosRedirect: 'http://169.254.169.254/latest/meta-data' });
    assert.strictEqual(res.status, 400);
  });

  it('rejects an unsafe variants[].url at creation', async () => {
    const res = await request(app)
      .post('/api/links')
      .set(authHeader(ownerToken))
      .send({
        originalUrl: 'https://example.com',
        routingType: 'ab_test',
        variants: [
          { name: 'A', url: 'https://example.com/a', weight: 50 },
          { name: 'B', url: 'http://127.0.0.1:5001/internal', weight: 50 },
        ],
      });
    assert.strictEqual(res.status, 400);
  });

  it('accepts a safe link and then rejects a private-IP originalUrl on update (the gap this fix closes)', async () => {
    const createRes = await request(app)
      .post('/api/links')
      .set(authHeader(ownerToken))
      .send({ originalUrl: 'https://example.com/safe' });
    assert.strictEqual(createRes.status, 201);
    const linkId = createRes.body.link._id;

    const updateRes = await request(app)
      .put(`/api/links/${linkId}`)
      .set(authHeader(ownerToken))
      .send({ originalUrl: 'http://localhost/admin' });
    assert.strictEqual(updateRes.status, 400);

    // Confirm the destination was never actually changed.
    const fetched = await Link.findById(linkId);
    assert.strictEqual(fetched.originalUrl, 'https://example.com/safe');
  });

  it('rejects an unsafe expiredRedirectUrl on update', async () => {
    const createRes = await request(app)
      .post('/api/links')
      .set(authHeader(ownerToken))
      .send({ originalUrl: 'https://example.com/safe2' });
    const linkId = createRes.body.link._id;

    const updateRes = await request(app)
      .put(`/api/links/${linkId}`)
      .set(authHeader(ownerToken))
      .send({ expiredRedirectUrl: 'http://169.254.169.254/' });
    assert.strictEqual(updateRes.status, 400);
  });
});

describe('reserved / colliding customAlias', () => {
  it('rejects a reserved word as a custom alias', async () => {
    const res = await request(app)
      .post('/api/links')
      .set(authHeader(ownerToken))
      .send({ originalUrl: 'https://example.com', customAlias: 'login' });
    assert.strictEqual(res.status, 400);
  });

  it('rejects a customAlias that collides with an existing shortCode', async () => {
    // Auto-generated shortCodes are mixed-case Base62 and wouldn't pass the
    // alias charset check, so seed one directly to isolate the collision
    // check itself (the redirect resolves by `$or` across both fields, so
    // a match on either side is a live hijack of someone else's link).
    const existingShortCode = 'existing-code-1';
    await Link.create({
      originalUrl: 'https://example.com/existing',
      shortCode: existingShortCode,
      shortUrl: `https://example.com/${existingShortCode}`,
      user: owner._id,
    });

    const collision = await request(app)
      .post('/api/links')
      .set(authHeader(ownerToken))
      .send({ originalUrl: 'https://example.com/second', customAlias: existingShortCode });
    assert.strictEqual(collision.status, 409);
  });
});

describe('ownership is enforced in the query, not fetched-then-compared', () => {
  it('returns 404 (not 403) for another user\'s link, so existence never leaks', async () => {
    const createRes = await request(app)
      .post('/api/links')
      .set(authHeader(ownerToken))
      .send({ originalUrl: 'https://example.com/private-to-owner' });
    const linkId = createRes.body.link._id;

    const asIntruder = await request(app).get(`/api/links/${linkId}`).set(authHeader(intruderToken));
    assert.strictEqual(asIntruder.status, 404);

    const updateAsIntruder = await request(app)
      .put(`/api/links/${linkId}`)
      .set(authHeader(intruderToken))
      .send({ title: 'hijacked' });
    assert.strictEqual(updateAsIntruder.status, 404);
  });
});
