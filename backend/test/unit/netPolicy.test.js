import { describe, it } from 'vitest';
import assert from 'node:assert';
import { isBlockedIp, isCloudMetadataHost, isDialable } from '../../src/lib/netPolicy.js';

describe('netPolicy.isBlockedIp', () => {
  const blocked = [
    '127.0.0.1',
    '127.255.255.255',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '169.254.169.254',
    '169.254.1.1',
    '0.0.0.0',
    '100.64.0.1', // carrier-grade NAT
    '224.0.0.1', // multicast
    '255.255.255.255',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'FE80:0:0:0:0:0:0:1',
    '::ffff:127.0.0.1',
    '::ffff:10.1.2.3',
    '64:ff9b::7f00:1', // NAT64-mapped 127.0.0.1
    '2002:7f00:1::', // 6to4-mapped 127.0.0.1
    'ff02::1',
  ];
  const allowed = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '192.169.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'];

  for (const ip of blocked) {
    it(`blocks ${ip}`, () => assert.strictEqual(isBlockedIp(ip), true));
  }
  for (const ip of allowed) {
    it(`allows ${ip}`, () => assert.strictEqual(isBlockedIp(ip), false));
  }

  it('treats a non-IP string as blocked', () => {
    assert.strictEqual(isBlockedIp('example.com'), true);
    assert.strictEqual(isBlockedIp(''), true);
  });
});

describe('netPolicy.isCloudMetadataHost', () => {
  it('recognises metadata hostnames regardless of case or trailing dot', () => {
    assert.strictEqual(isCloudMetadataHost('169.254.169.254'), true);
    assert.strictEqual(isCloudMetadataHost('Metadata.Google.Internal.'), true);
    assert.strictEqual(isCloudMetadataHost('foo.metadata.google.internal'), true);
    assert.strictEqual(isCloudMetadataHost('[fd00:ec2::254]'), true);
  });

  it('does not flag ordinary hosts', () => {
    assert.strictEqual(isCloudMetadataHost('hooks.example.com'), false);
    assert.strictEqual(isCloudMetadataHost('metadata.example.com'), false);
  });
});

describe('netPolicy.isDialable', () => {
  it('never dials cloud metadata, even when private ranges are allowed', () => {
    assert.strictEqual(isDialable('169.254.169.254', { allowPrivate: true }), false);
    assert.strictEqual(isDialable('169.254.10.10', { allowPrivate: true }), false);
  });

  it('dials loopback only when private ranges are allowed', () => {
    assert.strictEqual(isDialable('127.0.0.1'), false);
    assert.strictEqual(isDialable('127.0.0.1', { allowPrivate: true }), true);
  });

  it('always dials public addresses', () => {
    assert.strictEqual(isDialable('93.184.216.34'), true);
    assert.strictEqual(isDialable('2606:4700:4700::1111', { allowPrivate: true }), true);
  });
});
