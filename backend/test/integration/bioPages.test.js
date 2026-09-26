import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import BioPage from '../../src/models/BioPage.js';
import Link from '../../src/models/Link.js';
import Analytics from '../../src/models/Analytics.js';
import { closeRedis } from '../../src/services/cacheService.js';

let ownerA;
let ownerB;
const suffix = crypto.randomBytes(4).toString('hex');
const slugA = `jane-${suffix}`;

const api = (who) => ({
  get: (path) => request(app).get(`/api/bio-pages${path}`).set(authHeader(who.token)),
  post: (path, body) => request(app).post(`/api/bio-pages${path}`).set(authHeader(who.token)).send(body),
  patch: (path, body) => request(app).patch(`/api/bio-pages${path}`).set(authHeader(who.token)).send(body),
  put: (path, body) => request(app).put(`/api/bio-pages${path}`).set(authHeader(who.token)).send(body),
  delete: (path) => request(app).delete(`/api/bio-pages${path}`).set(authHeader(who.token)),
});

async function createLinkAs(who, originalUrl) {
  const res = await request(app).post('/api/links').set(authHeader(who.token)).send({ originalUrl });
  assert.strictEqual(res.status, 201);
  return res.body.link;
}

const slugCheck = (slug) => request(app).get('/api/bio-pages/slug-availability').query({ slug });

beforeAll(async () => {
  await connectTestDb();
  ownerA = await createTestUser({ name: 'Bio Owner A' });
  ownerB = await createTestUser({ name: 'Bio Owner B' });
});

afterAll(async () => {
  const userIds = [ownerA.user._id, ownerB.user._id];
  const linkIds = await Link.find({ user: { $in: userIds } }).distinct('_id');
  await Analytics.deleteMany({ link: { $in: linkIds } });
  await Link.deleteMany({ _id: { $in: linkIds } });
  await BioPage.deleteMany({ owner: { $in: userIds } });
  await mongoose.model('User').deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('bio page lifecycle', () => {
  it('creates one bio page per workspace, normalizing the slug and filling theme defaults', async () => {
    const res = await api(ownerA).post('', {
      slug: `  ${slugA.toUpperCase()} `,
      title: 'Jane Doe',
      bio: 'Links to everything I make.',
      theme: { primaryColor: '#112233' },
    });

    assert.strictEqual(res.status, 201);
    const page = res.body.bioPage;
    assert.strictEqual(page.slug, slugA);
    assert.strictEqual(String(page.workspace), String(ownerA.workspace._id));
    assert.strictEqual(String(page.owner), String(ownerA.user._id));
    assert.deepStrictEqual(page.theme, { primaryColor: '#112233', bgColor: '#0A0A0B', font: 'sans' });
    assert.deepStrictEqual(page.items, []);
    assert.strictEqual(page.viewCount, 0);

    const second = await api(ownerA).post('', { slug: `other-${suffix}` });
    assert.strictEqual(second.status, 409);
    assert.strictEqual(second.body.message, 'This workspace already has a bio page');
  });

  it('only updates editable fields and rejects unsafe theme values', async () => {
    const res = await api(ownerA).patch('', { bio: 'Updated bio', viewCount: 999, items: [], theme: { font: 'mono' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.bioPage.bio, 'Updated bio');
    assert.strictEqual(res.body.bioPage.viewCount, 0);
    assert.deepStrictEqual(res.body.bioPage.theme, { primaryColor: '#112233', bgColor: '#0A0A0B', font: 'mono' });

    const badColor = await api(ownerA).patch('', { theme: { bgColor: 'red;background:url(x)' } });
    assert.strictEqual(badColor.status, 400);
    const badFont = await api(ownerA).patch('', { theme: { font: 'Comic Sans' } });
    assert.strictEqual(badFont.status, 400);
    const badAvatar = await api(ownerA).patch('', { avatarUrl: 'javascript:alert(1)' });
    assert.strictEqual(badAvatar.status, 400);
  });
});

describe('bio page items', () => {
  let rawItem;
  let existingItem;
  let existingLink;

  it('adding an item from a raw URL creates a real workspace Link and lists it', async () => {
    const res = await api(ownerA).post('/items', { destinationUrl: 'example.com/bio-raw', label: 'My site', icon: 'globe' });

    assert.strictEqual(res.status, 201);
    [rawItem] = res.body.bioPage.items;
    assert.strictEqual(rawItem.label, 'My site');
    assert.strictEqual(rawItem.icon, 'globe');
    assert.strictEqual(rawItem.order, 0);
    assert.strictEqual(rawItem.active, true);

    const link = await Link.findById(rawItem.linkId);
    assert.ok(link);
    assert.strictEqual(link.originalUrl, 'https://example.com/bio-raw');
    assert.strictEqual(link.title, 'My site');
    assert.strictEqual(String(link.workspace), String(ownerA.workspace._id));
    assert.strictEqual(String(link.user), String(ownerA.user._id));
    assert.strictEqual(rawItem.link.shortCode, link.shortCode);
  });

  it('adds an existing workspace link, but not another workspace’s', async () => {
    existingLink = await createLinkAs(ownerA, 'https://example.com/bio-existing');
    const res = await api(ownerA).post('/items', { linkId: existingLink._id, label: 'Existing' });
    assert.strictEqual(res.status, 201);
    existingItem = res.body.bioPage.items.find((item) => item.label === 'Existing');
    assert.strictEqual(existingItem.order, 1);
    assert.strictEqual(String(existingItem.linkId), String(existingLink._id));

    const foreignLink = await createLinkAs(ownerB, 'https://example.com/bio-foreign');
    const foreign = await api(ownerA).post('/items', { linkId: foreignLink._id, label: 'Not mine' });
    assert.strictEqual(foreign.status, 404);
  });

  it('rejects an item with both or neither of linkId and destinationUrl', async () => {
    const both = await api(ownerA).post('/items', {
      linkId: existingLink._id,
      destinationUrl: 'https://example.com/x',
      label: 'Both',
    });
    assert.strictEqual(both.status, 400);
    const neither = await api(ownerA).post('/items', { label: 'Neither' });
    assert.strictEqual(neither.status, 400);
  });

  it('rejects an icon that is not an icon id', async () => {
    const res = await api(ownerA).post('/items', { linkId: existingLink._id, label: 'Bad icon', icon: '<svg onload=x>' });
    assert.strictEqual(res.status, 400);
    const page = await BioPage.findOne({ workspace: ownerA.workspace._id }).lean();
    assert.ok(!page.items.some((item) => item.label === 'Bad icon'));
  });

  it('reordering persists the new order', async () => {
    const res = await api(ownerA).put('/items/order', { itemIds: [existingItem._id, rawItem._id] });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.bioPage.items.map((item) => item.label),
      ['Existing', 'My site']
    );
    const stored = await BioPage.findOne({ workspace: ownerA.workspace._id }).lean();
    const orderOf = (id) => stored.items.find((item) => String(item._id) === String(id)).order;
    assert.strictEqual(orderOf(existingItem._id), 0);
    assert.strictEqual(orderOf(rawItem._id), 1);
  });

  it('rejects a reorder that does not list every item exactly once', async () => {
    const missing = await api(ownerA).put('/items/order', { itemIds: [rawItem._id] });
    assert.strictEqual(missing.status, 400);
    const duplicated = await api(ownerA).put('/items/order', { itemIds: [rawItem._id, rawItem._id] });
    assert.strictEqual(duplicated.status, 400);
  });

  it('edits an item’s label and icon, validating both', async () => {
    const res = await api(ownerA).patch(`/items/${rawItem._id}`, { label: '  Portfolio  ', icon: 'github' });
    assert.strictEqual(res.status, 200);
    const edited = res.body.bioPage.items.find((item) => item._id === rawItem._id);
    assert.deepStrictEqual([edited.label, edited.icon, edited.order], ['Portfolio', 'github', 1]);

    const cleared = await api(ownerA).patch(`/items/${rawItem._id}`, { icon: '' });
    assert.strictEqual(cleared.body.bioPage.items.find((item) => item._id === rawItem._id).icon, '');

    for (const body of [{ label: '   ' }, { label: 'x'.repeat(101) }, { icon: '<svg>' }, {}]) {
      const bad = await api(ownerA).patch(`/items/${rawItem._id}`, body);
      assert.strictEqual(bad.status, 400, JSON.stringify(body));
    }
    const foreign = await api(ownerB).patch(`/items/${rawItem._id}`, { label: 'Hijack' });
    assert.strictEqual(foreign.status, 404);
    await api(ownerA).patch(`/items/${rawItem._id}`, { label: 'My site' });
  });

  it('removing an item leaves the underlying Link intact', async () => {
    const res = await api(ownerA).delete(`/items/${rawItem._id}`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.bioPage.items.map((item) => item.label),
      ['Existing']
    );
    assert.ok(await Link.exists({ _id: rawItem.linkId }));

    const again = await api(ownerA).delete(`/items/${rawItem._id}`);
    assert.strictEqual(again.status, 404);
  });

  it('deleting a Link removes it from the bio page', async () => {
    const res = await request(app).delete(`/api/links/${existingLink._id}`).set(authHeader(ownerA.token));
    assert.strictEqual(res.status, 200);

    const page = await api(ownerA).get('');
    assert.deepStrictEqual(page.body.bioPage.items, []);
  });
});

describe('bio page slugs', () => {
  it('enforces slug uniqueness across workspaces, whatever the case', async () => {
    const res = await api(ownerB).post('', { slug: slugA.toUpperCase() });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.message, 'This slug is already taken');

    const ok = await api(ownerB).post('', { slug: `bob-${suffix}` });
    assert.strictEqual(ok.status, 201);

    const steal = await api(ownerB).patch('', { slug: slugA });
    assert.strictEqual(steal.status, 409);
  });

  it('reports availability publicly, without auth', async () => {
    const taken = await slugCheck(slugA.toUpperCase());
    assert.strictEqual(taken.status, 200);
    assert.deepStrictEqual(
      { slug: taken.body.slug, available: taken.body.available, reason: taken.body.reason },
      { slug: slugA, available: false, reason: 'taken' }
    );

    const free = await slugCheck(`free-${suffix}`);
    assert.strictEqual(free.body.available, true);
    assert.strictEqual(free.body.reason, undefined);

    for (const slug of ['ab', '-edge', 'edge-', 'has space', 'semi;colon', 'a'.repeat(41)]) {
      const invalid = await slugCheck(slug);
      assert.deepStrictEqual([invalid.body.available, invalid.body.reason], [false, 'invalid'], slug);
    }
  });

  it('rejects an invalid slug on create', async () => {
    const other = await createTestUser({ name: 'Bio Owner C' });
    try {
      const res = await api(other).post('', { slug: 'no_underscores' });
      assert.strictEqual(res.status, 400);
    } finally {
      await mongoose.model('User').deleteOne({ _id: other.user._id });
    }
  });
});
