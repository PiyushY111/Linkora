import { describe, it } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../src/app.js';

// Body parsing runs before routing and auth, so on the authenticated routes
// a 413 proves the parser rejected the body and a 401 proves it accepted
// it. Ordinary-route cases use the unauthenticated echo endpoint, which
// touches no database.
const ORDINARY_ROUTE = '/api/webhooks/debug/echo';
const jsonOfSize = (bytes) => JSON.stringify({ email: 'a@example.com', password: 'x', padding: 'a'.repeat(bytes) });

describe('request body limits', () => {
  it('rejects a 200 KB JSON body on an ordinary route with 413', async () => {
    const res = await request(app)
      .post(ORDINARY_ROUTE)
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(200 * 1024));
    assert.strictEqual(res.status, 413);
    assert.doesNotMatch(res.body.message, /10MB/);
  });

  it('rejects a 200 KB urlencoded body with 413', async () => {
    const res = await request(app)
      .post(ORDINARY_ROUTE)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(`email=a%40example.com&padding=${'a'.repeat(200 * 1024)}`);
    assert.strictEqual(res.status, 413);
  });

  it('accepts a small JSON body on an ordinary route', async () => {
    const res = await request(app)
      .post(ORDINARY_ROUTE)
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(10 * 1024));
    assert.strictEqual(res.status, 200);
  });

  it('keeps the larger allowance for bulk link creation', async () => {
    const res = await request(app)
      .post('/api/public/v1/links/bulk')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ links: [], padding: 'a'.repeat(1024 * 1024) }));
    assert.strictEqual(res.status, 401);
  });

  it('keeps a larger allowance for dashboard link create/update (QR logo data URLs)', async () => {
    const body = JSON.stringify({ originalUrl: 'https://example.com', qrConfig: { logo: 'a'.repeat(2 * 1024 * 1024) } });

    const create = await request(app).post('/api/links').set('Content-Type', 'application/json').send(body);
    assert.strictEqual(create.status, 401);

    const update = await request(app)
      .put('/api/links/000000000000000000000000')
      .set('Content-Type', 'application/json')
      .send(body);
    assert.strictEqual(update.status, 401);
  });

  it('does not extend the larger allowance to other /api/links routes', async () => {
    const res = await request(app)
      .patch('/api/links/000000000000000000000000/toggle')
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(200 * 1024));
    assert.strictEqual(res.status, 413);
  });
});
