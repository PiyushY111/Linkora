import { describe, it, expect } from 'vitest';
import { isValidAllowlistEntry } from '../utils/ipAllowlist.js';

describe('isValidAllowlistEntry', () => {
  it('accepts IPv4/IPv6 addresses and CIDR ranges', () => {
    for (const entry of ['203.0.113.7', '203.0.113.0/24', '10.0.0.0/8', '0.0.0.0/0', '2001:db8::1', '2001:db8::/32', '::1', ' 198.51.100.10 ']) {
      expect(isValidAllowlistEntry(entry)).toBe(true);
    }
  });

  it('rejects malformed entries', () => {
    for (const entry of ['', '1.2.3', '256.1.1.1', '1.2.3.4/33', '1.2.3.4/', '1.2.3.4/x', '2001:db8::/129', 'example.com', '1.2.3.4/8/8', 'g::1']) {
      expect(isValidAllowlistEntry(entry)).toBe(false);
    }
  });
});
