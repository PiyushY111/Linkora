import net from 'node:net';

/**
 * Addresses this server must never connect to on a user's behalf (link
 * destinations, webhook deliveries): loopback, private, link-local (which
 * includes cloud metadata at 169.254.169.254), and the other IANA
 * special-purpose ranges that are never a legitimate public destination.
 *
 * Uses node:net's BlockList, which also matches IPv4-mapped IPv6 addresses
 * (::ffff:127.0.0.1 and ::ffff:7f00:1) against the IPv4 ranges.
 */

/** Always blocked, even when private targets are allowed for local dev. */
const ALWAYS_BLOCKED = [
  ['0.0.0.0', 8, 'ipv4'], // "this network"
  ['100.64.0.0', 10, 'ipv4'], // carrier-grade NAT
  ['169.254.0.0', 16, 'ipv4'], // link-local, cloud metadata
  ['192.0.0.0', 24, 'ipv4'], // IETF protocol assignments
  ['192.0.2.0', 24, 'ipv4'], // TEST-NET-1
  ['198.18.0.0', 15, 'ipv4'], // benchmarking
  ['198.51.100.0', 24, 'ipv4'], // TEST-NET-2
  ['203.0.113.0', 24, 'ipv4'], // TEST-NET-3
  ['224.0.0.0', 4, 'ipv4'], // multicast
  ['240.0.0.0', 4, 'ipv4'], // reserved, and 255.255.255.255 broadcast
  ['::', 128, 'ipv6'], // unspecified
  ['fe80::', 10, 'ipv6'], // link-local
  ['ff00::', 8, 'ipv6'], // multicast
  ['64:ff9b::', 96, 'ipv6'], // NAT64: embeds an IPv4 address
  ['2001:db8::', 32, 'ipv6'], // documentation
];

/** Blocked unless the caller explicitly allows private targets. */
const PRIVATE = [
  ['127.0.0.0', 8, 'ipv4'], // loopback
  ['10.0.0.0', 8, 'ipv4'], // RFC 1918
  ['172.16.0.0', 12, 'ipv4'], // RFC 1918
  ['192.168.0.0', 16, 'ipv4'], // RFC 1918
  ['::1', 128, 'ipv6'], // loopback
  ['fc00::', 7, 'ipv6'], // unique local
];

function buildBlockList(ranges) {
  const list = new net.BlockList();
  for (const [address, prefix, family] of ranges) list.addSubnet(address, prefix, family);
  return list;
}

const alwaysBlocked = buildBlockList(ALWAYS_BLOCKED);
const privateRanges = buildBlockList(PRIVATE);

/**
 * Strips the brackets a URL hostname puts around an IPv6 literal and any
 * zone index ("fe80::1%eth0").
 * @param {string} host
 */
export function normalizeIpLiteral(host) {
  const unbracketed = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const zoneIndex = unbracketed.indexOf('%');
  return zoneIndex === -1 ? unbracketed : unbracketed.slice(0, zoneIndex);
}

/**
 * @param {string} address - an IP address as returned by DNS or a URL hostname
 * @param {{ allowPrivate?: boolean }} [options] - allowPrivate exempts
 *   loopback and RFC 1918 / unique-local space only (local development)
 * @returns {boolean} true if connecting to this address must be refused.
 *   Anything that is not a valid IP address is refused.
 */
export function isBlockedAddress(address, { allowPrivate = false } = {}) {
  const ip = normalizeIpLiteral(String(address || ''));
  const version = net.isIP(ip);
  if (version === 0) return true;

  const family = version === 4 ? 'ipv4' : 'ipv6';
  if (alwaysBlocked.check(ip, family)) return true;
  return !allowPrivate && privateRanges.check(ip, family);
}

export default isBlockedAddress;
