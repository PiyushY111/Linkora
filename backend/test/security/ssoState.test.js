import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { closeRedis } from '../../src/services/cacheService.js';

// SSO isn't configured with real WorkOS credentials in this environment, so
// these tests only exercise the state-verification boundary — the part of
// the callback that runs *before* any call out to WorkOS. That boundary is
// exactly what this fix adds, and it's fully testable without a live IdP:
// a forged/replayed state must never reach exchangeCodeForProfile at all.
let originalSsoEnabled;
let originalClientId;
let originalRedirectUri;

beforeAll(() => {
  originalSsoEnabled = env.SSO_ENABLED;
  originalClientId = env.WORKOS_CLIENT_ID;
  originalRedirectUri = env.WORKOS_REDIRECT_URI;
  env.SSO_ENABLED = true;
  env.WORKOS_CLIENT_ID = 'test-client-id';
  env.WORKOS_REDIRECT_URI = 'http://localhost:5001/api/auth/sso/callback';
});

afterAll(async () => {
  env.SSO_ENABLED = originalSsoEnabled;
  env.WORKOS_CLIENT_ID = originalClientId;
  env.WORKOS_REDIRECT_URI = originalRedirectUri;
  await closeRedis();
});

describe('SSO callback state verification', () => {
  it('rejects a callback with no state parameter at all', async () => {
    const res = await request(app).get('/api/auth/sso/callback').query({ code: 'abc123' });
    assert.strictEqual(res.status, 400);
  });

  it('rejects a callback with a state that was never issued (forged)', async () => {
    const res = await request(app)
      .get('/api/auth/sso/callback')
      .query({ code: 'abc123', state: 'never-issued-state' });
    assert.strictEqual(res.status, 401);
  });

  it('a state minted by /authorize is valid exactly once', async () => {
    const authorizeRes = await request(app).get('/api/auth/sso/authorize').redirects(0);
    assert.strictEqual(authorizeRes.status, 302);
    const state = new URL(authorizeRes.headers.location).searchParams.get('state');
    assert.ok(state);

    // First use passes state verification (it then fails downstream trying
    // to reach a real WorkOS tenant, which redirects to /login?error=... —
    // the point here is only that it got *past* the 400/401 state gate).
    const first = await request(app)
      .get('/api/auth/sso/callback')
      .query({ code: 'fake-code', state })
      .redirects(0);
    assert.notStrictEqual(first.status, 400);
    assert.notStrictEqual(first.status, 401);

    // Replaying the same state must now be rejected as already consumed.
    const second = await request(app)
      .get('/api/auth/sso/callback')
      .query({ code: 'fake-code', state })
      .redirects(0);
    assert.strictEqual(second.status, 401);
  });
});
