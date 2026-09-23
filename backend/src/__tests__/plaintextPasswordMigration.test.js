import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../index.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from './testUtils.js';
import Link from '../models/Link.js';
import { redis } from '../services/cacheService.js';
import { migratePlaintextLinkPasswords } from '../../scripts/migrate-plaintext-link-passwords.js';

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

describe('legacy plaintext link passwords', () => {
  it('a plaintext-stored password can no longer unlock the link', async () => {
    const link = await Link.create({
      originalUrl: 'https://example.com/legacy',
      shortCode: `legacy${Date.now()}`,
      shortUrl: `https://example.com/legacy${Date.now()}`,
      user: user._id,
      // Bypass the Link pre-save hook's auto-hash by writing directly via
      // updateOne, simulating a pre-existing plaintext value in the DB.
    });
    await Link.updateOne({ _id: link._id }, { $set: { password: 'plaintext-pwd' } });

    const res = await request(app)
      .post(`/api/r/${link.shortCode}/unlock`)
      .send({ password: 'plaintext-pwd' });

    // Bcrypt-only verification means an exact plaintext match is no longer
    // sufficient — isBcryptHash() rejects the stored value outright.
    assert.strictEqual(res.status, 401);
  });

  it('the migration script hashes it, after which the same password works', async () => {
    const link = await Link.create({
      originalUrl: 'https://example.com/legacy2',
      shortCode: `legacy2${Date.now()}`,
      shortUrl: `https://example.com/legacy2${Date.now()}`,
      user: user._id,
    });
    await Link.updateOne({ _id: link._id }, { $set: { password: 'plaintext-pwd-2' } });

    const { scanned, migrated } = await migratePlaintextLinkPasswords();
    assert.ok(scanned >= 1);
    assert.ok(migrated >= 1);

    const reloaded = await Link.findById(link._id);
    assert.match(reloaded.password, /^\$2[aby]\$/);
    assert.ok(await bcrypt.compare('plaintext-pwd-2', reloaded.password));

    const res = await request(app)
      .post(`/api/r/${link.shortCode}/unlock`)
      .send({ password: 'plaintext-pwd-2' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.unlockToken);
  });

  it('is safe to re-run: an already-bcrypt password is left untouched', async () => {
    const existingHash = await bcrypt.hash('already-hashed', 10);
    const link = await Link.create({
      originalUrl: 'https://example.com/already-hashed',
      shortCode: `hashed${Date.now()}`,
      shortUrl: `https://example.com/hashed${Date.now()}`,
      user: user._id,
      password: existingHash,
    });

    await migratePlaintextLinkPasswords();

    const reloaded = await Link.findById(link._id);
    assert.strictEqual(reloaded.password, existingHash);
  });
});
