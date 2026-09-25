import { describe, it } from 'vitest';
import assert from 'node:assert';
import { isIpAllowed, normalizeAllowlist, parseAllowlistEntry } from '../../src/utils/ipAllowlist.js';

describe('isIpAllowed', () => {
  it('allows everything when the list is empty or missing', () => {
    assert.strictEqual(isIpAllowed('198.51.100.7', []), true);
    assert.strictEqual(isIpAllowed('198.51.100.7', undefined), true);
  });

  it('matches exact IPv4 and IPv6 addresses', () => {
    assert.strictEqual(isIpAllowed('198.51.100.10', ['198.51.100.10']), true);
    assert.strictEqual(isIpAllowed('198.51.100.11', ['198.51.100.10']), false);
    assert.strictEqual(isIpAllowed('2001:db8::1', ['2001:db8::1']), true);
    assert.strictEqual(isIpAllowed('2001:db8::2', ['2001:db8::1']), false);
  });

  it('matches IPv4 and IPv6 CIDR ranges', () => {
    assert.strictEqual(isIpAllowed('203.0.113.77', ['203.0.113.0/24']), true);
    assert.strictEqual(isIpAllowed('203.0.114.1', ['203.0.113.0/24']), false);
    assert.strictEqual(isIpAllowed('10.200.3.4', ['10.0.0.0/8']), true);
    assert.strictEqual(isIpAllowed('2001:db8:abcd::5', ['2001:db8::/32']), true);
    assert.strictEqual(isIpAllowed('2001:db9::5', ['2001:db8::/32']), false);
  });

  it('treats IPv4-mapped IPv6 as the IPv4 address', () => {
    assert.strictEqual(isIpAllowed('::ffff:203.0.113.5', ['203.0.113.0/24']), true);
  });

  it('never lets a malformed IP through a non-empty list, and ignores malformed entries', () => {
    assert.strictEqual(isIpAllowed('not-an-ip', ['0.0.0.0/0']), false);
    assert.strictEqual(isIpAllowed('10.0.0.1', ['10.0.0.0/33']), false);
  });
});

describe('allowlist parsing', () => {
  it('canonicalizes and deduplicates, and reports invalid entries', () => {
    assert.deepStrictEqual(normalizeAllowlist([' 203.0.113.0/24 ', '198.51.100.10/32', '198.51.100.10', 'nope', '1.2.3.4/40', 42]), {
      valid: ['203.0.113.0/24', '198.51.100.10'],
      invalid: ['nope', '1.2.3.4/40', 42],
    });
  });

  it('rejects partial addresses and junk prefixes', () => {
    for (const entry of ['1.2.3', '1.2.3.4/', '1.2.3.4/abc', '1.2.3.4/8/8', '', '::g']) {
      assert.strictEqual(parseAllowlistEntry(entry), null, entry);
    }
  });
});
