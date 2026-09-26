import { describe, it, beforeAll, afterAll, vi } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import BioPage from '../../src/models/BioPage.js';
import BioPageViewDaily from '../../src/models/BioPageViewDaily.js';
import Link from '../../src/models/Link.js';
import Analytics from '../../src/models/Analytics.js';
import { processBatch } from '../../src/consumers/clickConsumer.js';
import { getAnalyticsRepository } from '../../src/repositories/analytics/analyticsRepository.js';
import { recordBioPageView } from '../../src/services/bioPageViews.js';
import { resetSpaShellCache } from '../../src/services/spaShell.js';
import { closeRedis } from '../../src/services/cacheService.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// processed_events outlives a run, so event ids must be unique per run.
const runId = `${Date.now()}${crypto.randomInt(1000)}`;
const slug = `stats-${crypto.randomBytes(4).toString('hex')}`;

let owner;
let outsider;
let items;

const utcDay = (daysAgo) => new Date(Date.now() - daysAgo * MS_PER_DAY).toISOString().slice(0, 10);
const analyticsUrl = (workspaceId) => `/api/workspaces/${workspaceId}/bio-page/analytics`;

function streamEntry(id, fields) {
  return [id, Object.entries(fields).flatMap(([k, v]) => [k, String(v)])];
}

async function clickLink(linkId, count, offset) {
  const link = await Link.findById(linkId);
  const base = {
    linkId: String(link._id),
    shortCode: link.shortCode,
    userId: String(owner.user._id),
    ip: '127.0.0.1',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    referer: 'direct',
    timestamp: Date.now(),
  };
  await processBatch(Array.from({ length: count }, (_, i) => streamEntry(`${runId}-${offset + i}`, base)));
}

beforeAll(async () => {
  await connectTestDb();
  owner = await createTestUser({ name: 'Stats Owner' });
  outsider = await createTestUser({ name: 'Stats Outsider' });
  const as = (method, path) => request(app)[method](`/api/bio-pages${path}`).set(authHeader(owner.token));

  await as('post', '').send({ slug, title: 'Stats' });
  for (const label of ['Portfolio', 'Shop', 'Blog']) {
    await as('post', '/items').send({ destinationUrl: `https://example.com/${label.toLowerCase()}`, label });
  }
  const page = await BioPage.findOne({ slug }).lean();
  items = Object.fromEntries(page.items.map((item) => [item.label, item]));

  await clickLink(items.Portfolio.linkId, 3, 0);
  await clickLink(items.Shop.linkId, 1, 100);

  await recordBioPageView(page._id);
  await recordBioPageView(page._id);
  await recordBioPageView(page._id, new Date(Date.now() - 3 * MS_PER_DAY));
});

afterAll(async () => {
  const userIds = [owner.user._id, outsider.user._id];
  const page = await BioPage.findOne({ slug });
  if (page) await BioPageViewDaily.deleteMany({ bioPage: page._id });
  await getAnalyticsRepository().deleteAnalytics({ userId: String(owner.user._id) });
  const linkIds = await Link.find({ user: { $in: userIds } }).distinct('_id');
  await Analytics.deleteMany({ link: { $in: linkIds } });
  await Link.deleteMany({ _id: { $in: linkIds } });
  await BioPage.deleteMany({ owner: { $in: userIds } });
  await mongoose.model('User').deleteMany({ _id: { $in: userIds } });
  await disconnectTestDb();
  await closeRedis();
});

describe('GET /api/workspaces/:workspaceId/bio-page/analytics', () => {
  it('a visit to /b/:slug is counted in both the total and the daily breakdown', async () => {
    resetSpaShellCache();
    const realFetch = globalThis.fetch;
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url, init) =>
        String(url).endsWith('/index.html') ? Promise.reject(new Error('no shell in tests')) : realFetch(url, init)
      );
    try {
      await request(app).get(`/b/${slug}`).expect(200);
    } finally {
      spy.mockRestore();
    }

    // Counted in the background, after the response; allow for a loaded run.
    await vi.waitFor(
      async () => {
        const page = await BioPage.findOne({ slug }).lean();
        assert.strictEqual(page.viewCount, 4);
      },
      { timeout: 5000 }
    );
  });

  it('combines the page’s views with each item’s existing link click stats', async () => {
    const res = await request(app)
      .get(analyticsUrl(owner.workspace._id))
      .query({ timeRange: '7d' })
      .set(authHeader(owner.token));

    assert.strictEqual(res.status, 200);
    const { views, items: rows, totalItemClicks } = res.body;

    // Views: all-time total, and the per-day series over the range.
    assert.strictEqual(views.allTime, 4);
    assert.strictEqual(views.inRange, 4);
    assert.strictEqual(views.granularity, 'day');
    const viewsOn = (day) => views.series.find((point) => point.day === day)?.views;
    assert.strictEqual(viewsOn(utcDay(0)), 3);
    assert.strictEqual(viewsOn(utcDay(3)), 1);
    assert.strictEqual(viewsOn(utcDay(1)), 0);
    assert.strictEqual(
      views.series.reduce((sum, point) => sum + point.views, 0),
      4
    );

    // Items, in page order, with their links' clicks and share of the total.
    assert.deepStrictEqual(
      rows.map(({ label, clicks, shareOfItemClicks }) => ({ label, clicks, shareOfItemClicks })),
      [
        { label: 'Portfolio', clicks: 3, shareOfItemClicks: 75 },
        { label: 'Shop', clicks: 1, shareOfItemClicks: 25 },
        { label: 'Blog', clicks: 0, shareOfItemClicks: 0 },
      ]
    );
    assert.strictEqual(totalItemClicks, 4);

    // Each item's numbers are exactly the link analytics endpoint's numbers.
    for (const row of rows) {
      const linkRes = await request(app)
        .get(`/api/analytics/link/${row.link.id}`)
        .query({ timeRange: '7d' })
        .set(authHeader(owner.token));
      assert.strictEqual(row.clicks, linkRes.body.analytics.totalClicks, row.label);
      assert.strictEqual(row.uniqueVisitors, linkRes.body.analytics.uniqueVisitors, row.label);
    }
  });

  it('is limited to members of the workspace', async () => {
    const res = await request(app).get(analyticsUrl(owner.workspace._id)).set(authHeader(outsider.token));
    assert.strictEqual(res.status, 403);
  });

  it('404s for a workspace without a bio page', async () => {
    const res = await request(app).get(analyticsUrl(outsider.workspace._id)).set(authHeader(outsider.token));
    assert.strictEqual(res.status, 404);
  });
});
