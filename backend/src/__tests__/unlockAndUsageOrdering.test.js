import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from './testUtils.js';
import Link from '../models/Link.js';
import { redis, getCurrentUsage } from '../services/cacheService.js';

let user;
let token;

before(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser());
});

after(async () => {
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await redis.quit();
});

describe('POST /api/r/:shortCode/unlock + GET /api/r/:shortCode (password gating)', () => {
  it('never puts the password in the redirect URL, and never spends a click on a failed attempt', async () => {
    const createRes = await request(app)
      .post('/api/links')
      .set(authHeader(token))
      .send({ originalUrl: 'https://example.com/secret', password: 'correct-horse', maxClicks: 2 });
    assert.strictEqual(createRes.status, 201);
    const { shortCode, _id: linkId } = createRes.body.link;

    // Wrong password: rejected, and the one-time link budget is untouched.
    const wrongUnlock = await request(app)
      .post(`/api/r/${shortCode}/unlock`)
      .send({ password: 'wrong-password' });
    assert.strictEqual(wrongUnlock.status, 401);
    assert.strictEqual(await getCurrentUsage(String(linkId)), 0);

    // No token at all on the redirect itself: also rejected, also free.
    const noTokenRedirect = await request(app).get(`/api/r/${shortCode}`);
    assert.strictEqual(noTokenRedirect.status, 403);
    assert.strictEqual(noTokenRedirect.body.requiresPassword, true);
    assert.strictEqual(await getCurrentUsage(String(linkId)), 0);

    // Correct password, exchanged out-of-band for a token — the password
    // itself is never sent as part of the redirect URL.
    const unlockRes = await request(app)
      .post(`/api/r/${shortCode}/unlock`)
      .send({ password: 'correct-horse' });
    assert.strictEqual(unlockRes.status, 200);
    assert.ok(unlockRes.body.unlockToken);
    assert.strictEqual(unlockRes.body.expiresIn, 60);

    const redirectRes = await request(app)
      .get(`/api/r/${shortCode}`)
      .query({ unlockToken: unlockRes.body.unlockToken })
      .redirects(0);
    assert.strictEqual(redirectRes.status, 307);
    assert.strictEqual(redirectRes.headers.location, 'https://example.com/secret');
    assert.strictEqual(await getCurrentUsage(String(linkId)), 1);

    // The unlock token is single-use: replaying it must fail even though
    // it hasn't expired and the link still has budget left (maxClicks: 2).
    const replay = await request(app).get(`/api/r/${shortCode}`).query({ unlockToken: unlockRes.body.unlockToken });
    assert.strictEqual(replay.status, 403);
    assert.strictEqual(await getCurrentUsage(String(linkId)), 1, 'a rejected replay must not spend a click either');
  });

  it('rate-limits unlock attempts to 5 per window per IP+shortCode', async () => {
    const createRes = await request(app)
      .post('/api/links')
      .set(authHeader(token))
      .send({ originalUrl: 'https://example.com/rl-target', password: 'topsecret' });
    const { shortCode } = createRes.body.link;

    let lastStatus;
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app)
        .post(`/api/r/${shortCode}/unlock`)
        .send({ password: 'still-wrong' });
      lastStatus = res.status;
    }
    assert.strictEqual(lastStatus, 429);
  });
});
