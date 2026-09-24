import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import User from '../../src/models/User.js';
import ApiKey from '../../src/models/ApiKey.js';
import { closeRedis } from '../../src/services/cacheService.js';
import { migrateLegacyApiKeys } from '../../scripts/migrate-legacy-api-keys.js';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const legacyKey = () => `lnk_${crypto.randomBytes(24).toString('hex')}`;
const createdUserIds = [];

// Writes the plaintext key straight into Mongo, the way the removed
// POST /api/auth/generate-api-key used to store it.
async function userWithLegacyKey() {
  const { user, token } = await createTestUser();
  createdUserIds.push(user._id);
  const key = legacyKey();
  await User.collection.updateOne({ _id: user._id }, { $set: { apiKey: key } });
  return { user, token, key };
}

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await ApiKey.deleteMany({ user: { $in: createdUserIds } });
  await User.deleteMany({ _id: { $in: createdUserIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('legacy plaintext API keys before migration', () => {
  it('GET /api/auth/me never returns the stored plaintext key', async () => {
    const { token, key } = await userWithLegacyKey();
    const res = await request(app).get('/api/auth/me').set(authHeader(token));
    assert.strictEqual(res.status, 200);
    assert.ok(!JSON.stringify(res.body).includes(key));
  });

  it('a plaintext legacy key no longer authenticates the public API', async () => {
    const { key } = await userWithLegacyKey();
    const res = await request(app).get('/api/public/v1/usage').set('x-api-key', key);
    assert.strictEqual(res.status, 401);
  });

  it('POST /api/auth/generate-api-key is gone', async () => {
    const { token } = await createTestUser();
    const res = await request(app).post('/api/auth/generate-api-key').set(authHeader(token));
    assert.strictEqual(res.status, 404);
  });
});

describe('migrateLegacyApiKeys', () => {
  it('moves each plaintext key into a hashed, full-scope ApiKey and unsets the plaintext', async () => {
    const { user, key } = await userWithLegacyKey();

    const result = await migrateLegacyApiKeys();
    assert.ok(result.migrated >= 1);

    const doc = await ApiKey.findOne({ user: user._id }).lean();
    assert.strictEqual(doc.keyHash, sha256(key));
    assert.deepStrictEqual(doc.scopes, ['*']);
    assert.strictEqual(doc.status, 'active');
    assert.ok(!JSON.stringify(doc).includes(key), 'the ApiKey document must not contain the raw key');

    const raw = await User.collection.findOne({ _id: user._id });
    assert.strictEqual(raw.apiKey, undefined);

    // The same key keeps working, now through the hashed lookup.
    const res = await request(app).get('/api/public/v1/usage').set('x-api-key', key);
    assert.strictEqual(res.status, 200);
  });

  it('is safe to re-run', async () => {
    await userWithLegacyKey();
    await migrateLegacyApiKeys();
    const second = await migrateLegacyApiKeys();
    assert.strictEqual(second.migrated, 0);
  });

  it('finishes a run that crashed between creating the ApiKey and unsetting the plaintext', async () => {
    const { user, key } = await userWithLegacyKey();
    await ApiKey.create({
      user: user._id,
      name: 'Legacy key (migrated)',
      keyHash: sha256(key),
      prefix: key.slice(0, 12),
      maskedKey: `${key.slice(0, 12)}...${key.slice(-4)}`,
      lastFour: key.slice(-4),
      scopes: ['*'],
    });

    await migrateLegacyApiKeys();

    assert.strictEqual(await ApiKey.countDocuments({ user: user._id }), 1);
    const raw = await User.collection.findOne({ _id: user._id });
    assert.strictEqual(raw.apiKey, undefined);
  });

  it('leaves users without a legacy key alone', async () => {
    const { user } = await createTestUser();
    createdUserIds.push(user._id);
    await migrateLegacyApiKeys();
    assert.strictEqual(await ApiKey.countDocuments({ user: user._id }), 0);
    assert.ok(await mongoose.model('User').exists({ _id: user._id }));
  });
});
