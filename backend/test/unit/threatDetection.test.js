import { describe, it, afterEach, vi } from 'vitest';
import assert from 'node:assert';
import { env } from '../../src/config/env.js';
import { checkUrlThreat } from '../../src/services/threatDetectionService.js';

const original = {
  SAFE_BROWSING_ENABLED: env.SAFE_BROWSING_ENABLED,
  SAFE_BROWSING_API_KEY: env.SAFE_BROWSING_API_KEY,
  VIRUSTOTAL_ENABLED: env.VIRUSTOTAL_ENABLED,
};

afterEach(() => {
  Object.assign(env, original);
  vi.unstubAllGlobals();
});

describe('Google Safe Browsing lookup', () => {
  it('sends the API key in the X-Goog-Api-Key header, never in the URL', async () => {
    Object.assign(env, { SAFE_BROWSING_ENABLED: true, SAFE_BROWSING_API_KEY: 'test-key-123', VIRUSTOTAL_ENABLED: false });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [{ threatType: 'MALWARE' }] }) }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkUrlThreat('https://malware.example');

    assert.deepStrictEqual(result, { malicious: true, source: 'google-safe-browsing' });
    const [url, init] = fetchMock.mock.calls[0];
    assert.ok(!String(url).includes('test-key-123'), `API key leaked into the URL: ${url}`);
    assert.strictEqual(new URL(url).search, '');
    assert.strictEqual(init.headers['X-Goog-Api-Key'], 'test-key-123');
  });
});
