import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import { closeRedis } from '../../src/services/cacheService.js';

let user;
let token;
let link;

beforeAll(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser());
  const shortCode = `rm${Date.now().toString(36)}`;
  link = await Link.create({
    user: user._id,
    originalUrl: 'https://example.com/route-mounting',
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
  });
});

afterAll(async () => {
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('/api/r serves only the redirect routes', () => {
  it('GET /api/r/:shortCode redirects', async () => {
    const res = await request(app).get(`/api/r/${link.shortCode}`).redirects(0);
    assert.strictEqual(res.status, 307);
    assert.strictEqual(res.headers.location, link.originalUrl);
  });

  it.each(['/api/r/export', '/api/r/summary/all', '/api/r/link/000000000000000000000000'])(
    'GET %s is not an analytics endpoint',
    async (path) => {
      const res = await request(app).get(path).set(authHeader(token)).redirects(0);
      assert.strictEqual(res.status, 404);
      assert.notStrictEqual(res.headers['content-type']?.split(';')[0], 'text/csv');
      assert.strictEqual(res.body.summary, undefined);
    }
  );
});

describe('/api/analytics serves only the analytics routes', () => {
  it('GET /api/analytics/summary/all works', async () => {
    const res = await request(app).get('/api/analytics/summary/all').set(authHeader(token));
    assert.strictEqual(res.status, 200);
  });

  it('GET /api/analytics/:shortCode does not redirect', async () => {
    const res = await request(app).get(`/api/analytics/${link.shortCode}`).redirects(0);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.location, undefined);
  });

  it('POST /api/analytics/:shortCode/unlock does not exist', async () => {
    const res = await request(app).post(`/api/analytics/${link.shortCode}/unlock`).send({ password: 'x' });
    assert.strictEqual(res.status, 404);
  });
});
