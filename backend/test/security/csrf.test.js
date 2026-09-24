import { describe, it } from 'vitest';
import assert from 'node:assert';
import { verifyOriginForCsrf } from '../../src/middleware/csrf.js';
import { env } from '../../src/config/env.js';

function run(headers) {
  return new Promise((resolve) => {
    const req = { headers };
    const res = {};
    let nextCalled = false;
    let thrown = null;
    try {
      verifyOriginForCsrf(req, res, () => {
        nextCalled = true;
      });
    } catch (err) {
      thrown = err;
    }
    resolve({ nextCalled, thrown });
  });
}

describe('verifyOriginForCsrf', () => {
  it('allows a request whose Origin matches FRONTEND_URL', async () => {
    const { nextCalled, thrown } = await run({ origin: env.FRONTEND_URL });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(thrown, null);
  });

  it('rejects a request from a different Origin', async () => {
    const { nextCalled, thrown } = await run({ origin: 'https://evil.example.com' });
    assert.strictEqual(nextCalled, false);
    assert.ok(thrown);
    assert.strictEqual(thrown.status, 403);
  });

  it('falls back to Referer when Origin is absent', async () => {
    const { nextCalled } = await run({ referer: `${env.FRONTEND_URL}/dashboard` });
    assert.strictEqual(nextCalled, true);
  });

  it('rejects an arbitrary *.vercel.app wildcard Origin', async () => {
    const { nextCalled, thrown } = await run({ origin: 'https://attacker-app.vercel.app' });
    assert.strictEqual(nextCalled, false);
    assert.ok(thrown);
    assert.strictEqual(thrown.status, 403);
  });

  it('allows a request with neither Origin nor Referer (non-browser client)', async () => {
    const { nextCalled, thrown } = await run({});
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(thrown, null);
  });
});
