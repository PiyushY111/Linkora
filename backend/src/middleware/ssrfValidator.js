import dns from 'dns/promises';
import net from 'node:net';
import { isBlockedAddress, normalizeIpLiteral } from '../lib/ipBlocklist.js';

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * Validates that a URL is safe to store as a destination: http(s) only, and
 * every address its host resolves to is outside the blocked ranges in
 * lib/ipBlocklist.js. IP-literal hosts are checked directly, without DNS;
 * the WHATWG URL parser has already normalised decimal, octal and hex
 * forms (http://2130706433/ has hostname 127.0.0.1).
 *
 * This is a point-in-time check. The redirect path doesn't fetch the
 * destination (the browser does, after a 307), but anything that makes a
 * server-side request must also re-check at connect time, since DNS can
 * change between this check and the connection (DNS rebinding). See
 * lib/ssrfSafeDispatcher.js, used for webhook delivery.
 *
 * @param {string} url
 * @param {{ lookup?: typeof dns.lookup, allowPrivate?: boolean }} [options]
 *   `lookup` is injectable so tests can simulate DNS answers.
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function validateUrlSafety(url, { lookup = dns.lookup, allowPrivate = false } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { safe: false, reason: `URL scheme "${parsed.protocol}" is not allowed` };
  }

  const host = normalizeIpLiteral(parsed.hostname);
  if (net.isIP(host)) {
    return isBlockedAddress(host, { allowPrivate })
      ? { safe: false, reason: 'Destination is a private or restricted address' }
      : { safe: true };
  }

  let addresses;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    return { safe: false, reason: 'Could not resolve destination host' };
  }

  if (addresses.length === 0 || addresses.some((addr) => isBlockedAddress(addr.address, { allowPrivate }))) {
    return { safe: false, reason: 'Destination resolves to a private or restricted address' };
  }

  return { safe: true };
}

export default validateUrlSafety;
