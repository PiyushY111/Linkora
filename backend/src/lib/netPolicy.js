import net from 'net';

/**
 * The one answer to "may this server open a connection to that address?",
 * shared by link-destination validation (middleware/ssrfValidator.js) and
 * webhook delivery (services/webhookService.js). Keeping both on the same
 * table means a range added here is blocked on every outbound path.
 */

const CLOUD_METADATA_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal', 'metadata', 'fd00:ec2::254']);

/** IPv4 ranges that are never a legitimate public destination. */
const PRIVATE_IPV4_RANGES = [
  '0.0.0.0/8', // "this" network
  '10.0.0.0/8', // RFC 1918
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local (includes cloud metadata)
  '172.16.0.0/12', // RFC 1918
  '192.0.0.0/24', // IETF protocol assignments
  '192.168.0.0/16', // RFC 1918
  '198.18.0.0/15', // benchmarking
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved + broadcast
];

function ipv4ToInt(addr) {
  return addr.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIpv4InCidr(ip, cidr) {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

/**
 * Expands an IPv6 address to its 8 hextets so prefix checks don't depend on
 * how the address was abbreviated ("fe80::1" vs "fe80:0:0:0:0:0:0:1").
 */
function expandIpv6(ip) {
  const [head, tail = ''] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const middle = ip.includes('::') ? Array(Math.max(missing, 0)).fill('0') : [];
  return [...headParts, ...middle, ...tailParts].map((h) => h.padStart(4, '0'));
}

function isBlockedIpv6(ip) {
  const normalized = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) is judged as the IPv4 address it wraps.
  const mappedMatch = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mappedMatch) return isBlockedIp(mappedMatch[1]);

  const hextets = expandIpv6(normalized);
  const first = parseInt(hextets[0], 16);
  if (hextets.every((h) => h === '0000')) return true; // :: unspecified
  if (hextets.slice(0, 7).every((h) => h === '0000') && hextets[7] === '0001') return true; // ::1
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if (first === 0xff00 || (first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  // 64:ff9b::/96 (NAT64) and 2002::/16 (6to4) embed an IPv4 address.
  if (hextets[0] === '0064' && hextets[1] === 'ff9b') {
    const embedded = `${parseInt(hextets[6].slice(0, 2), 16)}.${parseInt(hextets[6].slice(2), 16)}.${parseInt(hextets[7].slice(0, 2), 16)}.${parseInt(hextets[7].slice(2), 16)}`;
    return isBlockedIp(embedded);
  }
  if (hextets[0] === '2002') {
    const embedded = `${parseInt(hextets[1].slice(0, 2), 16)}.${parseInt(hextets[1].slice(2), 16)}.${parseInt(hextets[2].slice(0, 2), 16)}.${parseInt(hextets[2].slice(2), 16)}`;
    return isBlockedIp(embedded);
  }
  return false;
}

/**
 * True when `ip` is loopback, private, link-local, multicast, reserved, or a
 * cloud metadata address, in either IP family.
 * @param {string} ip
 */
export function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return PRIVATE_IPV4_RANGES.some((range) => isIpv4InCidr(ip, range));
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  // Not an IP literal at all: nothing we can connect to safely.
  return true;
}

/**
 * True when `hostname` names a cloud metadata service. Checked by name,
 * ahead of DNS, so a resolver that answers with a public-looking address
 * for one of these names can't slip past the IP check.
 * @param {string} hostname
 */
export function isCloudMetadataHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[(.*)\]$/, '$1');
  if (CLOUD_METADATA_HOSTS.has(host)) return true;
  return host.endsWith('.metadata.google.internal') || host.endsWith('.internal');
}

/**
 * Whether a resolved address may be dialed under the given policy. Private
 * ranges are optionally allowed (development, where a webhook commonly
 * points at this very app on localhost); cloud metadata never is.
 * @param {string} ip
 * @param {{ allowPrivate?: boolean }} [options]
 */
export function isDialable(ip, { allowPrivate = false } = {}) {
  if (CLOUD_METADATA_HOSTS.has(String(ip).toLowerCase())) return false;
  if (net.isIPv4(ip) && isIpv4InCidr(ip, '169.254.0.0/16')) return false;
  if (!allowPrivate) return !isBlockedIp(ip);
  return net.isIPv4(ip) || net.isIPv6(ip);
}

export default { isBlockedIp, isCloudMetadataHost, isDialable };
