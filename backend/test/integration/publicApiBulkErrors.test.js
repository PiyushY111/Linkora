import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import { ConflictError, toClientError } from '../../src/lib/errors.js';
import { closeRedis } from '../../src/services/cacheService.js';

let user;
let token;

beforeAll(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser());
});

afterAll(async () => {
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('toClientError', () => {
  it('exposes AppError messages and hides everything unexpected', () => {
    assert.deepStrictEqual(toClientError(new ConflictError('alias taken')), { status: 409, message: 'alias taken' });
    assert.strictEqual(toClientError(new TypeError('x.trim is not a function')), null);
    assert.strictEqual(toClientError(undefined), null);
  });
});

describe('POST /api/public/v1/links/bulk', () => {
  it('reports per-item failures without leaking raw internal error messages', async () => {
    const res = await request(app)
      .post('/api/public/v1/links/bulk')
      .set(authHeader(token))
      .send({
        links: [
          // A non-string ogTitle makes link creation throw a raw TypeError.
          { originalUrl: 'https://example.com/bulk-bad', ogTitle: 123 },
          'https://example.com/bulk-ok',
        ],
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.succeeded, 1);

    const failed = res.body.results.find((r) => !r.success);
    assert.strictEqual(failed.message, 'Failed to create link');
    assert.ok(!JSON.stringify(res.body).includes('is not a function'));
  });
});
