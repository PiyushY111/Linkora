import dns from 'dns/promises';
import { isBlockedIp } from '../lib/netPolicy.js';

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * Validates that a link destination URL is safe to store and (eventually)
 * fetch server-side: http(s) only, and no resolved address is loopback,
 * private, link-local or a cloud metadata address (lib/netPolicy.js is the
 * single table of blocked ranges, shared with webhook delivery).
 *
 * Note on DNS rebinding: this app's redirect path issues a client-side 307
 * (the browser fetches the destination, not this server), so the classic
 * "validate then proxy" rebinding window doesn't apply to the hot path.
 * This check exists for creation-time hardening and for any future
 * server-side fetch of the destination (e.g. link previews) — callers doing
 * a server-side fetch should re-resolve and re-validate immediately before
 * connecting, not trust a cached result.
 *
 * @param {string} url
 * @param {{ lookup?: typeof dns.lookup }} [deps] - injectable for tests
 *   that need to simulate a private IP or a DNS-rebinding answer without
 *   controlling real DNS.
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function validateUrlSafety(url, { lookup = dns.lookup } = {}) {
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
    addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
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
