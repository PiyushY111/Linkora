import crypto from 'crypto';

/**
 * The `Linkora-Signature` scheme: `t=<unix seconds>,v1=<hex hmac>[,v1=<hex hmac>]`
 * where each v1 is HMAC-SHA256 over `${t}.${rawBody}` with one signing
 * secret. Two v1 values appear only during a secret-rotation grace period,
 * so a receiver accepts the header if ANY v1 matches the secret it holds.
 */

export const SIGNATURE_VERSION = 'v1';
export const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * @param {string} rawBody exact bytes sent as the request body
 * @param {string} secret
 * @param {number} timestamp unix seconds
 */
export function computeSignature(rawBody, secret, timestamp) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/**
 * @param {string} rawBody
 * @param {string[]} secrets current secret first, then any still-valid previous one
 * @param {number} [timestamp] unix seconds
 * @returns {{ timestamp: number, header: string }}
 */
export function signPayload(rawBody, secrets, timestamp = Math.floor(Date.now() / 1000)) {
  const parts = secrets.map((secret) => `${SIGNATURE_VERSION}=${computeSignature(rawBody, secret, timestamp)}`);
  return { timestamp, header: [`t=${timestamp}`, ...parts].join(',') };
}

/**
 * Receiver-side verification, the reference implementation for the docs and
 * for the built-in echo endpoint. Constant-time comparison; rejects
 * timestamps outside the tolerance window to stop replays.
 * @param {string | undefined} header
 * @param {string} rawBody
 * @param {string} secret
 * @param {{ toleranceSeconds?: number, now?: number }} [options]
 * @returns {{ valid: boolean, reason?: string }}
 */
export function verifySignature(header, rawBody, secret, { toleranceSeconds = DEFAULT_TOLERANCE_SECONDS, now } = {}) {
  if (!header) return { valid: false, reason: 'missing signature header' };
  const fields = header.split(',').map((part) => part.split('='));
  const timestamp = Number(fields.find(([key]) => key === 't')?.[1]);
  const provided = fields.filter(([key]) => key === SIGNATURE_VERSION).map(([, value]) => value || '');
  if (!Number.isFinite(timestamp) || provided.length === 0) return { valid: false, reason: 'malformed signature header' };

  const nowSeconds = now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return { valid: false, reason: 'timestamp outside tolerance' };

  const expected = Buffer.from(computeSignature(rawBody, secret, timestamp), 'hex');
  const matches = provided.some((candidate) => {
    const given = Buffer.from(candidate, 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  return matches ? { valid: true } : { valid: false, reason: 'signature mismatch' };
}

export default { signPayload, verifySignature, computeSignature };
