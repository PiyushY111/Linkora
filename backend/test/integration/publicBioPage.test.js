import { describe, it, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import BioPage from '../../src/models/BioPage.js';
import Link from '../../src/models/Link.js';
import Analytics from '../../src/models/Analytics.js';
import { resetSpaShellCache } from '../../src/services/spaShell.js';
import { closeRedis } from '../../src/services/cacheService.js';

// Shaped like the Vite build's dist/index.html.
const SHELL = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Linkora — Links, engineered</title>
    <meta name="description" content="Shorten URLs, track real-time analytics." />
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-def456.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;
const SHELL_URL = new URL('/index.html', env.FRONTEND_URL).href;

let owner;
let page;
let items;
const slug = `og-${crypto.randomBytes(4).toString('hex')}`;
const realFetch = globalThis.fetch;

function stubShell(response) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) =>
    String(url) === SHELL_URL ? response() : realFetch(url, init)
  );
}

const ogContent = (html, property) =>
  new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)" />`).exec(html)?.[1];

beforeAll(async () => {
  await connectTestDb();
  owner = await createTestUser({ name: 'OG Owner' });
  const as = (method, path) => request(app)[method](`/api/bio-pages${path}`).set(authHeader(owner.token));

  await as('post', '').send({
    slug,
    title: 'Jane "JD" <Doe> $& Co',
    bio: 'Designer & maker.',
    avatarUrl: 'https://images.example.com/jane.png',
    theme: { primaryColor: '#FF5C5C', bgColor: '#0E0D12', font: 'mono' },
  });
  await as('post', '/items').send({ destinationUrl: 'https://example.com/portfolio', label: 'Portfolio', icon: 'globe' });
  await as('post', '/items').send({ destinationUrl: 'https://example.com/hidden', label: 'Hidden item' });
  await as('post', '/items').send({ destinationUrl: 'https://example.com/paused', label: 'Paused link' });
  const res = await as('post', '/items').send({ destinationUrl: 'https://example.com/shop', label: 'Shop' });
  page = res.body.bioPage;
  items = Object.fromEntries(page.items.map((item) => [item.label, item]));

  // Neither an inactive item nor a paused link may appear publicly.
  await BioPage.updateOne({ _id: page._id, 'items._id': items['Hidden item']._id }, { $set: { 'items.$.active': false } });
  await Link.updateOne({ _id: items['Paused link'].linkId }, { $set: { isActive: false } });
});

beforeEach(() => {
  resetSpaShellCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  const linkIds = await Link.find({ user: owner.user._id }).distinct('_id');
  await Analytics.deleteMany({ link: { $in: linkIds } });
  await Link.deleteMany({ _id: { $in: linkIds } });
  await BioPage.deleteMany({ owner: owner.user._id });
  await mongoose.model('User').deleteOne({ _id: owner.user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('GET /b/:slug', () => {
  it('serves the SPA shell with escaped Open Graph and Twitter tags for the page', async () => {
    stubShell(() => Promise.resolve(new Response(SHELL, { status: 200 })));

    const res = await request(app).get(`/b/${slug.toUpperCase()}`);

    assert.strictEqual(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    const html = res.text;
    const title = 'Jane &quot;JD&quot; &lt;Doe&gt; $&amp; Co';
    assert.strictEqual(ogContent(html, 'og:title'), title);
    assert.strictEqual(ogContent(html, 'og:description'), 'Designer &amp; maker.');
    assert.strictEqual(ogContent(html, 'og:image'), 'https://images.example.com/jane.png');
    assert.strictEqual(ogContent(html, 'og:url'), new URL(`/b/${slug}`, env.FRONTEND_URL).href);
    assert.strictEqual(ogContent(html, 'og:type'), 'profile');
    assert.strictEqual(ogContent(html, 'twitter:card'), 'summary');
    assert.strictEqual(ogContent(html, 'twitter:title'), title);
    assert.strictEqual(ogContent(html, 'twitter:image'), 'https://images.example.com/jane.png');

    // The shell's own title/description are replaced, not duplicated...
    assert.ok(html.includes(`<title>${title} | Linkora</title>`));
    assert.strictEqual(html.match(/<title>/g).length, 1);
    assert.strictEqual(html.match(/<meta name="description"/g).length, 1);
    assert.ok(!html.includes('Links, engineered'));
    // ...and nothing unescaped from the page leaks into the markup.
    assert.ok(!html.includes('<Doe>'));
    // The real build's assets still load, so visitors get the React app.
    assert.ok(html.includes('<script type="module" crossorigin src="/assets/index-abc123.js"></script>'));
    assert.ok(html.includes('<div id="root"></div>'));
    assert.match(res.headers['content-security-policy'], /style-src [^;]*https:\/\/fonts\.googleapis\.com/);
  });

  it('counts the view without waiting for it', async () => {
    stubShell(() => Promise.resolve(new Response(SHELL, { status: 200 })));
    const before = (await BioPage.findById(page._id)).viewCount;

    await request(app).get(`/b/${slug}`).expect(200);

    // The view is counted in the background, after the response; allow for a
    // loaded test run.
    await vi.waitFor(async () => assert.strictEqual((await BioPage.findById(page._id)).viewCount, before + 1), {
      timeout: 5000,
    });
  });

  it('returns a noindex 404 in the same shell for an unknown or malformed slug', async () => {
    stubShell(() => Promise.resolve(new Response(SHELL, { status: 200 })));

    for (const unknown of [`missing-${slug}`, '-bad-']) {
      const res = await request(app).get(`/b/${unknown}`);
      assert.strictEqual(res.status, 404, unknown);
      assert.ok(res.text.includes('<meta name="robots" content="noindex" />'));
      assert.ok(res.text.includes('/assets/index-abc123.js'));
      assert.strictEqual(ogContent(res.text, 'og:title'), undefined);
    }
  });

  it('falls back to a standalone page with the same tags and plain links if the shell is unreachable', async () => {
    stubShell(() => Promise.reject(new Error('connect ECONNREFUSED')));

    const res = await request(app).get(`/b/${slug}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(ogContent(res.text, 'og:image'), 'https://images.example.com/jane.png');
    const shop = await Link.findById(items.Shop.linkId);
    assert.ok(res.text.includes(`href="${shop.shortUrl}"`));
    assert.ok(!res.text.includes('Hidden item'));
  });
});

describe('GET /api/bio-pages/public/:slug', () => {
  it('returns only public fields, and only active items with active links, in order', async () => {
    const res = await request(app).get(`/api/bio-pages/public/${slug}`);

    assert.strictEqual(res.status, 200);
    const { bioPage } = res.body;
    assert.deepStrictEqual(Object.keys(bioPage).sort(), ['avatarUrl', 'bio', 'items', 'slug', 'theme', 'title']);
    assert.deepStrictEqual(bioPage.theme, { primaryColor: '#FF5C5C', bgColor: '#0E0D12', font: 'mono' });

    const [portfolio, shop] = await Promise.all([
      Link.findById(items.Portfolio.linkId),
      Link.findById(items.Shop.linkId),
    ]);
    assert.deepStrictEqual(bioPage.items, [
      { id: String(items.Portfolio._id), label: 'Portfolio', icon: 'globe', shortUrl: portfolio.shortUrl },
      { id: String(items.Shop._id), label: 'Shop', icon: null, shortUrl: shop.shortUrl },
    ]);
  });

  it('404s for an unknown slug', async () => {
    const res = await request(app).get(`/api/bio-pages/public/missing-${slug}`);
    assert.strictEqual(res.status, 404);
  });
});
