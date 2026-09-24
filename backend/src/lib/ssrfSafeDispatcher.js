import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { isBlockedAddress, normalizeIpLiteral } from './ipBlocklist.js';

/**
 * Server-side HTTP requests to user-supplied URLs (webhook deliveries).
 *
 * Validating a URL and then fetching it is racy: DNS can answer with a
 * public address during validation and a private one when the connection
 * is made (DNS rebinding). Here the check happens inside the connection
 * itself: the undici Agent's `connect.lookup` resolves the hostname, refuses
 * if any answer is blocked, and hands the socket exactly the addresses it
 * checked. There is no second resolution to race against.
 *
 * IP-literal hosts never reach `lookup` (net.connect skips DNS for them),
 * so they are checked before the request starts. Redirects are never
 * followed; the caller gets the 3xx response.
 */

export class BlockedDestinationError extends Error {
  constructor(message = 'Destination resolves to a private or restricted address') {
    super(message);
    this.name = 'BlockedDestinationError';
    this.code = 'ERR_SSRF_BLOCKED';
  }
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * @param {{ lookup?: typeof dns.promises.lookup, allowPrivate?: boolean }} [options]
 *   `lookup` is promise-based and injectable, so tests can simulate DNS.
 */
export function createSsrfSafeDispatcher({ lookup = dns.promises.lookup, allowPrivate = false } = {}) {
  return new Agent({
    connect: {
      // Node's net.connect calls this with { all: true } when
      // autoSelectFamily is on (the default since Node 20) and expects an
      // array back; otherwise it expects (address, family).
      lookup(hostname, options, callback) {
        Promise.resolve(lookup(hostname, { all: true, verbatim: true })).then(
          (addresses) => {
            if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address, { allowPrivate }))) {
              callback(new BlockedDestinationError());
              return;
            }
            if (options?.all) {
              callback(null, addresses);
            } else {
              callback(null, addresses[0].address, addresses[0].family);
            }
          },
          (err) => callback(err)
        );
      },
    },
  });
}

/**
 * Reads at most `maxBytes` of a response body as text and discards the
 * rest, so a hostile endpoint can't make us buffer an unbounded body.
 */
async function readBoundedText(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
}

/**
 * POSTs/GETs a user-supplied URL with the SSRF checks described above.
 * Throws BlockedDestinationError before any connection to a blocked
 * address; network errors propagate as undici's `fetch failed` with the
 * BlockedDestinationError (or other cause) on `err.cause`.
 *
 * @param {string} url
 * @param {RequestInit} init - method, headers, body, signal
 * @param {{ lookup?: typeof dns.promises.lookup, allowPrivate?: boolean, maxBodyBytes?: number }} [options]
 * @returns {Promise<{ status: number, statusText: string, headers: Record<string, string>, body: string }>}
 */
export async function ssrfSafeFetch(url, init, { lookup, allowPrivate = false, maxBodyBytes = 2048 } = {}) {
  const parsed = new URL(url);
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new BlockedDestinationError(`URL scheme "${parsed.protocol}" is not allowed`);
  }
  const host = normalizeIpLiteral(parsed.hostname);
  if (net.isIP(host) && isBlockedAddress(host, { allowPrivate })) {
    throw new BlockedDestinationError();
  }

  const dispatcher = createSsrfSafeDispatcher({ lookup, allowPrivate });
  try {
    // undici's own fetch, not the global one: a dispatcher from a different
    // undici version than Node's bundled copy is rejected.
    const response = await undiciFetch(parsed, { ...init, dispatcher, redirect: 'manual' });
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const body = await readBoundedText(response, maxBodyBytes);
    return { status: response.status, statusText: response.statusText, headers, body };
  } finally {
    await dispatcher.close().catch(() => {});
  }
}

export default ssrfSafeFetch;
