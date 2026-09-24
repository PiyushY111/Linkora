import crypto from 'crypto';
import net from 'net';
import { env } from '../config/env.js';

/**
 * Visitor-IP handling for click analytics.
 *
 * anonymizeIp() is applied by the click consumer before storage when the
 * link owner has turned on "Visitor IP anonymization": IPv4 keeps its /24
 * (last octet zeroed), IPv6 keeps its /48.
 *
 * hashVisitorIp() produces the visitor key used for unique-visitor counts.
 * It is an HMAC with a server-side key, not a bare SHA-256: the whole IPv4
 * space is only 2^32 addresses, so an unkeyed hash can be reversed by brute
 * force in minutes, which would undo the anonymisation.
 */

const IPV6_KEPT_HEXTETS = 3; // /48
const MAPPED_V4_PREFIX = /^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i;
const hashKey = env.IP_HASH_SECRET || env.JWT_SECRET;

function expandIpv6(ip) {
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  if (tail === undefined) return headParts.map((h) => parseInt(h, 16));
  const tailParts = tail ? tail.split(':') : [];
  const zeros = new Array(8 - headParts.length - tailParts.length).fill('0');
  return [...headParts, ...zeros, ...tailParts].map((h) => parseInt(h, 16));
}

/** RFC 5952 text form: lowercase, no leading zeros, longest zero run as "::". */
function formatIpv6(hextets) {
  let bestStart = -1;
  let bestLength = 0;
  for (let i = 0; i < hextets.length; ) {
    if (hextets[i] !== 0) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < hextets.length && hextets[j] === 0) j += 1;
    if (j - i > bestLength && j - i > 1) {
      bestStart = i;
      bestLength = j - i;
    }
    i = j;
  }
  const hex = hextets.map((h) => h.toString(16));
  if (bestStart === -1) return hex.join(':');
  const left = hex.slice(0, bestStart).join(':');
  const right = hex.slice(bestStart + bestLength).join(':');
  return `${left}::${right}`;
}

/**
 * @param {string} ip
 * @returns {string} the masked address, or '' if `ip` is not an IP address
 */
export function anonymizeIp(ip) {
  const value = String(ip || '').replace(MAPPED_V4_PREFIX, '');
  if (net.isIPv4(value)) {
    return `${value.split('.').slice(0, 3).join('.')}.0`;
  }
  if (net.isIPv6(value)) {
    const hextets = expandIpv6(value);
    return formatIpv6(hextets.map((h, i) => (i < IPV6_KEPT_HEXTETS ? h : 0)));
  }
  return '';
}

/**
 * @param {string} ip - the full, unmasked address
 * @returns {string} hex HMAC-SHA256, or '' when there is no IP
 */
export function hashVisitorIp(ip) {
  if (!ip) return '';
  return crypto.createHmac('sha256', hashKey).update(String(ip)).digest('hex');
}
