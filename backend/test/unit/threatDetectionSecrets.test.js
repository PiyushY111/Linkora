import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';

const API_KEY = 'sb-test-key-must-not-appear-in-urls';

describe('Safe Browsing request', () => {
  let calls;

  beforeEach(() => {
    calls = [];
    vi.resetModules();
    vi.stubEnv('SAFE_BROWSING_ENABLED', 'true');
    vi.stubEnv('SAFE_BROWSING_API_KEY', API_KEY);
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers || {} });
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('sends the API key in a header, never in the URL', async () => {
    const { checkUrlThreat } = await import('../../src/services/threatDetectionService.js');

    const result = await checkUrlThreat('https://example.com/');

    assert.deepStrictEqual(result, { malicious: false, source: null });
    assert.strictEqual(calls.length, 1);
    assert.ok(!calls[0].url.includes(API_KEY), 'API key must not be in the request URL');
    assert.ok(!new URL(calls[0].url).searchParams.has('key'));
    assert.strictEqual(calls[0].headers['X-Goog-Api-Key'], API_KEY);
  });
});
