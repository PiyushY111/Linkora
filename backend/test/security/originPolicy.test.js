import { describe, it } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { createOriginPolicy, parseAllowedOrigins } from '../../src/lib/originPolicy.js';
import { verifyOriginForCsrf } from '../../src/middleware/csrf.js';

describe('createOriginPolicy', () => {
  const production = createOriginPolicy({
    frontendUrl: 'https://app.linkora.dev',
    allowedOrigins: ['https://preview.linkora.dev'],
    nodeEnv: 'production',
  });
  const development = createOriginPolicy({
    frontendUrl: 'https://app.linkora.dev',
    allowedOrigins: [],
    nodeEnv: 'development',
  });

  it.each([
    ['FRONTEND_URL origin', 'https://app.linkora.dev', true],
    ['ALLOWED_ORIGINS entry', 'https://preview.linkora.dev', true],
    ['any *.vercel.app host', 'https://attacker.vercel.app', false],
    ['a lookalike suffix', 'https://app.linkora.dev.evil.com', false],
    ['same host over http', 'http://app.linkora.dev', false],
    ['same host on another port', 'https://app.linkora.dev:8443', false],
    ['the opaque "null" origin', 'null', false],
    ['localhost in production', 'http://localhost:3000', false],
    ['an empty string', '', false],
  ])('production: %s -> %s', (_label, origin, expected) => {
    assert.strictEqual(production(origin), expected);
  });

  it('allows localhost and 127.0.0.1 on any port outside production', () => {
    assert.strictEqual(development('http://localhost:5173'), true);
    assert.strictEqual(development('http://127.0.0.1:3000'), true);
    assert.strictEqual(development('https://attacker.vercel.app'), false);
  });
});

describe('parseAllowedOrigins', () => {
  it('splits, trims and normalises a comma-separated list', () => {
    assert.deepStrictEqual(parseAllowedOrigins(' https://a.example.com , https://b.example.com:8443 '), [
      'https://a.example.com',
      'https://b.example.com:8443',
    ]);
  });

  it('returns an empty list for an empty value', () => {
    assert.deepStrictEqual(parseAllowedOrigins(''), []);
    assert.deepStrictEqual(parseAllowedOrigins(undefined), []);
  });

  it.each(['*', 'https://*.vercel.app', 'https://a.example.com/path', 'not a url', 'ftp://a.example.com'])(
    'rejects %s',
    (value) => {
      assert.throws(() => parseAllowedOrigins(value));
    }
  );
});

describe('CORS uses the shared origin policy', () => {
  it('does not grant credentialed CORS to https://attacker.vercel.app', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://attacker.vercel.app');
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
  });

  it('grants credentialed CORS to FRONTEND_URL', async () => {
    const origin = new URL(env.FRONTEND_URL).origin;
    const res = await request(app).get('/health').set('Origin', origin);
    assert.strictEqual(res.headers['access-control-allow-origin'], origin);
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  });
});

describe('CSRF guard uses the shared origin policy', () => {
  function run(headers) {
    let nextCalled = false;
    let thrown = null;
    try {
      verifyOriginForCsrf({ headers }, {}, () => {
        nextCalled = true;
      });
    } catch (err) {
      thrown = err;
    }
    return { nextCalled, thrown };
  }

  it('rejects https://attacker.vercel.app', () => {
    const { nextCalled, thrown } = run({ origin: 'https://attacker.vercel.app' });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(thrown?.status, 403);
  });

  it('rejects a Referer from https://attacker.vercel.app', () => {
    const { nextCalled, thrown } = run({ referer: 'https://attacker.vercel.app/page' });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(thrown?.status, 403);
  });

  it('POST /api/auth/logout from https://attacker.vercel.app is 403', async () => {
    const res = await request(app).post('/api/auth/logout').set('Origin', 'https://attacker.vercel.app');
    assert.strictEqual(res.status, 403);
  });
});
