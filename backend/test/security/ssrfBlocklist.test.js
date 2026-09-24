import { describe, it } from 'vitest';
import assert from 'node:assert';
import { isBlockedAddress } from '../../src/lib/ipBlocklist.js';
import { validateUrlSafety } from '../../src/middleware/ssrfValidator.js';

// [address, blocked?, why]. Each range is checked at its edges and just
// outside them, so an off-by-one prefix length shows up as a failure.
const ADDRESS_TABLE = [
  // IPv4 special-purpose ranges
  ['0.0.0.0', true, '0.0.0.0/8 "this network"'],
  ['0.255.255.255', true, '0.0.0.0/8 upper edge'],
  ['10.0.0.1', true, '10.0.0.0/8 RFC 1918'],
  ['10.255.255.255', true, '10.0.0.0/8 upper edge'],
  ['100.64.0.1', true, '100.64.0.0/10 carrier-grade NAT'],
  ['100.127.255.255', true, '100.64.0.0/10 upper edge'],
  ['100.128.0.0', false, 'just above 100.64.0.0/10'],
  ['100.63.255.255', false, 'just below 100.64.0.0/10'],
  ['127.0.0.1', true, '127.0.0.0/8 loopback'],
  ['127.255.255.254', true, '127.0.0.0/8 upper edge'],
  ['169.254.169.254', true, 'cloud metadata (169.254.0.0/16)'],
  ['172.16.0.1', true, '172.16.0.0/12 RFC 1918'],
  ['172.31.255.255', true, '172.16.0.0/12 upper edge'],
  ['172.32.0.0', false, 'just above 172.16.0.0/12'],
  ['192.0.0.8', true, '192.0.0.0/24 IETF protocol assignments'],
  ['192.0.2.10', true, '192.0.2.0/24 TEST-NET-1'],
  ['192.168.1.1', true, '192.168.0.0/16 RFC 1918'],
  ['198.18.0.1', true, '198.18.0.0/15 benchmarking'],
  ['198.19.255.255', true, '198.18.0.0/15 upper edge'],
  ['198.20.0.0', false, 'just above 198.18.0.0/15'],
  ['198.51.100.7', true, '198.51.100.0/24 TEST-NET-2'],
  ['203.0.113.9', true, '203.0.113.0/24 TEST-NET-3'],
  ['224.0.0.1', true, '224.0.0.0/4 multicast'],
  ['239.255.255.255', true, '224.0.0.0/4 upper edge'],
  ['240.0.0.1', true, '240.0.0.0/4 reserved'],
  ['255.255.255.255', true, 'broadcast (240.0.0.0/4)'],
  ['8.8.8.8', false, 'public IPv4'],
  ['93.184.216.34', false, 'public IPv4'],

  // IPv6
  ['::', true, 'unspecified'],
  ['::1', true, 'loopback'],
  ['fc00::1', true, 'fc00::/7 unique local'],
  ['fdff:ffff::1', true, 'fc00::/7 upper half'],
  ['fe80::1', true, 'fe80::/10 link-local'],
  ['febf::1', true, 'fe80::/10 upper edge'],
  ['fec0::1', false, 'just above fe80::/10 (deprecated site-local, not listed)'],
  ['ff02::1', true, 'ff00::/8 multicast'],
  ['64:ff9b::7f00:1', true, '64:ff9b::/96 NAT64'],
  ['2001:db8::1', true, '2001:db8::/32 documentation'],
  ['2001:4860:4860::8888', false, 'public IPv6'],

  // IPv4-mapped IPv6, dotted and hex forms
  ['::ffff:127.0.0.1', true, 'mapped loopback (dotted)'],
  ['::ffff:7f00:1', true, 'mapped loopback (hex)'],
  ['::ffff:a9fe:a9fe', true, 'mapped cloud metadata (hex)'],
  ['::ffff:10.1.2.3', true, 'mapped RFC 1918 (dotted)'],
  ['::ffff:8.8.8.8', false, 'mapped public (dotted)'],
  ['::ffff:808:808', false, 'mapped public (hex)'],
  ['0:0:0:0:0:ffff:7f00:1', true, 'mapped loopback (uncompressed)'],

  // Anything that is not a plain IP fails closed
  ['localhost', true, 'hostname, not an IP'],
  ['', true, 'empty string'],
  ['2130706433', true, 'decimal integer is not an IP literal here'],
];

describe('isBlockedAddress', () => {
  it.each(ADDRESS_TABLE)('%s -> blocked=%s (%s)', (address, blocked) => {
    assert.strictEqual(isBlockedAddress(address), blocked);
  });

  it('with allowPrivate, exempts loopback and private ranges only', () => {
    const allowPrivate = { allowPrivate: true };
    assert.strictEqual(isBlockedAddress('127.0.0.1', allowPrivate), false);
    assert.strictEqual(isBlockedAddress('10.0.0.1', allowPrivate), false);
    assert.strictEqual(isBlockedAddress('192.168.1.1', allowPrivate), false);
    assert.strictEqual(isBlockedAddress('::1', allowPrivate), false);
    assert.strictEqual(isBlockedAddress('::ffff:7f00:1', allowPrivate), false);
    // Cloud metadata and the rest of the special-purpose space stay blocked.
    assert.strictEqual(isBlockedAddress('169.254.169.254', allowPrivate), true);
    assert.strictEqual(isBlockedAddress('::ffff:a9fe:a9fe', allowPrivate), true);
    assert.strictEqual(isBlockedAddress('100.64.0.1', allowPrivate), true);
    assert.strictEqual(isBlockedAddress('0.0.0.0', allowPrivate), true);
  });
});

const neverResolves = async () => {
  throw new Error('DNS must not be consulted for an IP literal');
};

describe('validateUrlSafety: encodings of localhost in the URL', () => {
  it.each([
    'http://127.0.0.1/',
    'http://2130706433/', // decimal
    'http://0x7f000001/', // hex
    'http://0177.0.0.1/', // octal
    'http://0x7f.1/', // mixed hex, short form
    'http://127.1/', // short form
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[0:0:0:0:0:ffff:7f00:1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://0xa9fea9fe/', // metadata, hex
  ])('%s is rejected without a DNS lookup', async (url) => {
    const result = await validateUrlSafety(url, { lookup: neverResolves });
    assert.strictEqual(result.safe, false);
  });

  it('accepts a public IP literal without a DNS lookup', async () => {
    const result = await validateUrlSafety('https://93.184.216.34/', { lookup: neverResolves });
    assert.strictEqual(result.safe, true);
  });
});

describe('validateUrlSafety: resolved hostnames', () => {
  const resolvingTo = (...addresses) => async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

  it.each(['127.0.0.1', '10.0.0.5', '100.64.1.1', '::1', '::ffff:7f00:1', 'fd00::1', '169.254.169.254'])(
    'rejects a hostname resolving to %s',
    async (address) => {
      const result = await validateUrlSafety('https://internal.example.com/', { lookup: resolvingTo(address) });
      assert.strictEqual(result.safe, false);
    }
  );

  it('rejects when any one of several answers is blocked', async () => {
    const result = await validateUrlSafety('https://mixed.example.com/', {
      lookup: resolvingTo('93.184.216.34', '10.0.0.1'),
    });
    assert.strictEqual(result.safe, false);
  });

  it('accepts a hostname resolving only to public addresses', async () => {
    const result = await validateUrlSafety('https://example.com/', {
      lookup: resolvingTo('93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'),
    });
    assert.strictEqual(result.safe, true);
  });

  it.each(['ftp://example.com/', 'file:///etc/passwd', 'gopher://example.com/', 'not a url'])(
    'rejects %s',
    async (url) => {
      const result = await validateUrlSafety(url, { lookup: resolvingTo('93.184.216.34') });
      assert.strictEqual(result.safe, false);
    }
  );
});
