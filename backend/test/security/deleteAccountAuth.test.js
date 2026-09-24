import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import User from '../../src/models/User.js';
import { closeRedis } from '../../src/services/cacheService.js';

let user;
let token;
const TEST_PASSWORD = 'password123';

beforeAll(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser({ password: TEST_PASSWORD }));
});

afterAll(async () => {
  if (user?._id) {
    await Link.deleteMany({ user: user._id });
    await User.deleteOne({ _id: user._id });
  }
  await disconnectTestDb();
  await closeRedis();
});

describe('security: DELETE /api/auth/account authentication requirement', () => {
  it('rejects account deletion when password field is omitted from request body', async () => {
    const res = await request(app)
      .delete('/api/auth/account')
      .set(authHeader(token))
      .send({});

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Password is required/i);

    // Verify user is not deleted
    const stillExists = await User.findById(user._id);
    assert.ok(stillExists, 'User must remain in database after omitted-password attempt');
  });

  it('rejects account deletion when password field is empty string', async () => {
    const res = await request(app)
      .delete('/api/auth/account')
      .set(authHeader(token))
      .send({ password: '' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Password is required/i);

    const stillExists = await User.findById(user._id);
    assert.ok(stillExists);
  });

  it('rejects account deletion when password is incorrect', async () => {
    const res = await request(app)
      .delete('/api/auth/account')
      .set(authHeader(token))
      .send({ password: 'wrong-password' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Incorrect password/i);

    const stillExists = await User.findById(user._id);
    assert.ok(stillExists);
  });

  it('successfully deletes account and cascades when correct password is provided', async () => {
    // Create an associated link for user
    const link = await Link.create({
      originalUrl: 'https://example.com/delete-test',
      shortCode: `del${Date.now()}`,
      shortUrl: `https://example.com/del${Date.now()}`,
      user: user._id,
    });

    const res = await request(app)
      .delete('/api/auth/account')
      .set(authHeader(token))
      .send({ password: TEST_PASSWORD });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Verify user and cascade resources deleted
    const userInDb = await User.findById(user._id);
    assert.strictEqual(userInDb, null, 'User should be deleted from DB');

    const linkInDb = await Link.findById(link._id);
    assert.strictEqual(linkInDb, null, 'User links should be cascade-deleted');
  });
});
