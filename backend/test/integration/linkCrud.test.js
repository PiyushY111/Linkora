import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import User from '../../src/models/User.js';
import { closeRedis, getRedis, linkMetaKey, setLinkMeta, buildLinkMetaFromDoc } from '../../src/services/cacheService.js';

let user;
let token;
let other;
let otherToken;

beforeAll(async () => {
  await connectTestDb();
  ({ user, token } = await createTestUser());
  ({ user: other, token: otherToken } = await createTestUser());
});

afterAll(async () => {
  await Link.deleteMany({ user: { $in: [user._id, other._id] } });
  await User.deleteMany({ _id: { $in: [user._id, other._id] } });
  await disconnectTestDb();
  await closeRedis();
});

async function create(body, as = token) {
  const res = await request(app).post('/api/links').set(authHeader(as)).send(body);
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return res.body.link;
}

async function cacheLink(link) {
  await setLinkMeta(link.shortCode, buildLinkMetaFromDoc(await Link.findById(link._id).lean()));
  assert.strictEqual(await getRedis().exists(linkMetaKey(link.shortCode)), 1);
}

describe('POST /api/links', () => {
  it('creates a link with a generated 6-character short code owned by the caller', async () => {
    const link = await create({ originalUrl: 'https://example.com/created', title: 'Created' });
    assert.match(link.shortCode, /^[0-9a-zA-Z]{6}$/);
    assert.strictEqual(String(link.user), String(user._id));
    assert.strictEqual(link.isActive, true);
  });

  it('stores a link password as a bcrypt hash, never in plaintext', async () => {
    const link = await create({ originalUrl: 'https://example.com/pw', password: 'hunter22' });
    const stored = await Link.findById(link._id).lean();
    assert.match(stored.password, /^\$2[aby]\$/);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/links').send({ originalUrl: 'https://example.com' });
    assert.strictEqual(res.status, 401);
  });
});

describe('GET /api/links', () => {
  let tagged;
  let disabled;

  beforeAll(async () => {
    tagged = await create({ originalUrl: 'https://example.com/tagged', title: 'Tagged a.b', tags: ['crud-tag'], category: 'marketing' });
    disabled = await create({ originalUrl: 'https://example.com/disabled', title: 'Disabled one' });
    await request(app).patch(`/api/links/${disabled._id}/toggle`).set(authHeader(token));
  });

  it('only returns the caller\'s links', async () => {
    await create({ originalUrl: 'https://example.com/other-user' }, otherToken);
    const res = await request(app).get('/api/links').set(authHeader(token));
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.links.length > 0);
    assert.ok(res.body.links.every((l) => String(l.user) === String(user._id)));
  });

  it('filters by tag, category and status', async () => {
    const byTag = await request(app).get('/api/links').query({ tag: 'crud-tag' }).set(authHeader(token));
    assert.deepStrictEqual(byTag.body.links.map((l) => l._id), [tagged._id]);

    const byCategory = await request(app).get('/api/links').query({ category: 'marketing' }).set(authHeader(token));
    assert.deepStrictEqual(byCategory.body.links.map((l) => l._id), [tagged._id]);

    const byStatus = await request(app).get('/api/links').query({ status: 'disabled' }).set(authHeader(token));
    assert.deepStrictEqual(byStatus.body.links.map((l) => l._id), [disabled._id]);
  });

  it('treats search text literally, not as a regular expression', async () => {
    const literal = await request(app).get('/api/links').query({ search: 'a.b' }).set(authHeader(token));
    assert.deepStrictEqual(literal.body.links.map((l) => l._id), [tagged._id]);

    const unbalanced = await request(app).get('/api/links').query({ search: '(unclosed' }).set(authHeader(token));
    assert.strictEqual(unbalanced.status, 200);
    assert.strictEqual(unbalanced.body.links.length, 0);
  });

  it('caps the page size at 100 and computes skip and page count from the capped size', async () => {
    const { user: bulkUser, token: bulkToken } = await createTestUser();
    try {
      await Link.insertMany(
        Array.from({ length: 150 }, (_, i) => ({
          user: bulkUser._id,
          originalUrl: `https://example.com/page-${i}`,
          shortCode: `pg${Date.now().toString(36)}${i}`,
          shortUrl: `http://localhost/pg${i}`,
        }))
      );

      const page2 = await request(app).get('/api/links').query({ limit: 500, page: 2 }).set(authHeader(bulkToken));
      assert.strictEqual(page2.status, 200);
      assert.strictEqual(page2.body.pagination.totalCount, 150);
      assert.strictEqual(page2.body.pagination.pages, 2, 'pages must use the capped page size (100)');
      assert.strictEqual(page2.body.links.length, 50, 'page 2 of 100-per-page holds the last 50 links');
    } finally {
      await Link.deleteMany({ user: bulkUser._id });
      await User.deleteOne({ _id: bulkUser._id });
    }
  });
});

describe('GET /api/links/:id', () => {
  it('returns 400 for a malformed id instead of a 500', async () => {
    const res = await request(app).get('/api/links/not-an-object-id').set(authHeader(token));
    assert.strictEqual(res.status, 400);
  });
});

describe('PUT /api/links/:id', () => {
  it('updates fields and invalidates the cached redirect metadata', async () => {
    const link = await create({ originalUrl: 'https://example.com/before' });
    await cacheLink(link);

    const res = await request(app)
      .put(`/api/links/${link._id}`)
      .set(authHeader(token))
      .send({ originalUrl: 'https://example.com/after', title: 'Renamed' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.link.originalUrl, 'https://example.com/after');
    assert.strictEqual(res.body.link.title, 'Renamed');
    assert.strictEqual(await getRedis().exists(linkMetaKey(link.shortCode)), 0);

    const redirect = await request(app).get(`/api/r/${link.shortCode}`).redirects(0);
    assert.strictEqual(redirect.headers.location, 'https://example.com/after');
  });

  it('sets, then removes, a password, click cap and expiry', async () => {
    const link = await create({ originalUrl: 'https://example.com/settings' });

    await request(app)
      .put(`/api/links/${link._id}`)
      .set(authHeader(token))
      .send({ password: 'new-secret', maxClicks: 5, expiryDate: '2099-01-01T00:00:00Z' });
    let stored = await Link.findById(link._id).lean();
    assert.match(stored.password, /^\$2[aby]\$/);
    assert.strictEqual(stored.maxClicks, 5);
    assert.strictEqual(stored.expiryDate.toISOString(), '2099-01-01T00:00:00.000Z');

    await request(app)
      .put(`/api/links/${link._id}`)
      .set(authHeader(token))
      .send({ removePassword: true, removeMaxClicks: true, removeExpiryDate: true });
    stored = await Link.findById(link._id).lean();
    assert.strictEqual(stored.password, null);
    assert.strictEqual(stored.maxClicks, null);
    assert.strictEqual(stored.expiryDate, null);
  });

  it('is 404 for another user\'s link', async () => {
    const link = await create({ originalUrl: 'https://example.com/mine' });
    const res = await request(app).put(`/api/links/${link._id}`).set(authHeader(otherToken)).send({ title: 'x' });
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await Link.findById(link._id).lean()).title, undefined);
  });
});

describe('PATCH /api/links/:id/toggle', () => {
  it('disables the link, invalidates the cache, and the redirect stops working', async () => {
    const link = await create({ originalUrl: 'https://example.com/toggle' });
    await cacheLink(link);

    const res = await request(app).patch(`/api/links/${link._id}/toggle`).set(authHeader(token));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.link.isActive, false);
    assert.strictEqual(await getRedis().exists(linkMetaKey(link.shortCode)), 0);

    const redirect = await request(app).get(`/api/r/${link.shortCode}`).redirects(0);
    assert.strictEqual(redirect.status, 410);
  });
});

describe('DELETE /api/links/:id', () => {
  it('deletes the link, invalidates the cache and removes it from the owner', async () => {
    const link = await create({ originalUrl: 'https://example.com/delete-me' });
    await User.updateOne({ _id: user._id }, { $push: { links: link._id } });
    await cacheLink(link);

    const res = await request(app).delete(`/api/links/${link._id}`).set(authHeader(token));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await Link.exists({ _id: link._id }), null);
    assert.strictEqual(await getRedis().exists(linkMetaKey(link.shortCode)), 0);
    const owner = await User.findById(user._id).lean();
    assert.ok(!owner.links.map(String).includes(String(link._id)));
  });

  it('is 404 for another user\'s link, and leaves it in place', async () => {
    const link = await create({ originalUrl: 'https://example.com/not-yours' });
    const res = await request(app).delete(`/api/links/${link._id}`).set(authHeader(otherToken));
    assert.strictEqual(res.status, 404);
    assert.ok(await Link.exists({ _id: link._id }));
  });
});

describe('ownership across users is independent of link state', () => {
  it('another user cannot toggle a link', async () => {
    const link = await create({ originalUrl: 'https://example.com/no-toggle' });
    const res = await request(app).patch(`/api/links/${link._id}/toggle`).set(authHeader(otherToken));
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await Link.findById(link._id).lean()).isActive, true);
    assert.ok(mongoose.isValidObjectId(link._id));
  });
});
