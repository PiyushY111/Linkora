import dns from 'dns/promises';
import net from 'net';

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

const CLOUD_METADATA_IPS = new Set(['169.254.169.254']);

/**
 * @param {string} ip
 * @returns {boolean}
 */
function isIpv4InCidr(ip, cidr) {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const ipToInt = (addr) => addr.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
}

const PRIVATE_IPV4_RANGES = [
  '127.0.0.0/8', // loopback
  '10.0.0.0/8', // RFC 1918
  '172.16.0.0/12', // RFC 1918
  '192.168.0.0/16', // RFC 1918
  '169.254.0.0/16', // link-local (includes cloud metadata)
  '0.0.0.0/8',
];

/**
 * @param {string} ip
 * @returns {boolean}
 */
function isBlockedIp(ip) {
  if (CLOUD_METADATA_IPS.has(ip)) return true;

  if (net.isIPv4(ip)) {
    return PRIVATE_IPV4_RANGES.some((range) => isIpv4InCidr(ip, range));
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // ::1 loopback, fc00::/7 unique local, fe80::/10 link-local, and the
    // IPv4-mapped ::ffff:a.b.c.d form (checked against the same IPv4 ranges).
    if (normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe80')) return true;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      if (net.isIPv4(mapped)) return isBlockedIp(mapped);
    }
  }

  return false;
}

/**
 * Validates that a link destination URL is safe to store and (eventually)
 * fetch server-side: http(s) only, and the resolved IP isn't loopback, RFC
 * 1918 private space, or a cloud metadata address.
 *
 * Note on DNS rebinding: this app's redirect path issues a client-side 307
 * (the browser fetches the destination, not this server), so the classic
 * "validate then proxy" rebinding window doesn't apply to the hot path.
 * This check exists for creation-time hardening and for any future
 * server-side fetch of the destination (e.g. link previews, webhook
 * payload fetches) — callers doing a server-side fetch should re-resolve
 * and re-validate immediately before connecting, not trust a cached result.
 *
 * @param {string} url
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function validateUrlSafety(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { safe: false, reason: `URL scheme "${parsed.protocol}" is not allowed` };
  }

  let addresses;
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  } catch {
    return { safe: false, reason: 'Could not resolve destination host' };
  }

  const blocked = addresses.find((addr) => isBlockedIp(addr.address));
  if (blocked) {
    return { safe: false, reason: 'Destination resolves to a private or restricted address' };
  }

  return { safe: true };
}

/**
 * Express middleware: validates req.body.originalUrl before link creation.
 */
export async function ssrfValidationMiddleware(req, res, next) {
  const { originalUrl } = req.body;
  if (!originalUrl) return next();

  const result = await validateUrlSafety(originalUrl);
  if (!result.safe) {
    return res.status(400).json({ success: false, message: `URL rejected: ${result.reason}` });
  }
  next();
}

export default validateUrlSafety;
