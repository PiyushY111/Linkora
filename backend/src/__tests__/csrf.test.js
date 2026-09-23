import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verifyOriginForCsrf } from '../middleware/csrf.js';
import { env } from '../config/env.js';

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

  it('allows a request with neither Origin nor Referer (non-browser client)', async () => {
    const { nextCalled, thrown } = await run({});
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(thrown, null);
  });
});
