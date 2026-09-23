import crypto from 'crypto';

/**
 * Constant-time string comparison for secrets (bearer tokens, API keys)
 * compared directly in application code, so a byte-by-byte `===` can't leak
 * how many leading characters matched via response timing.
 */
export function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));

  if (bufA.length !== bufB.length) {
    // Still perform a fixed-cost compare so the length mismatch itself
    // doesn't return measurably faster than a full comparison.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

export default constantTimeEqual;
