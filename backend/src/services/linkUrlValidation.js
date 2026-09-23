import { validateUrlSafety } from '../middleware/ssrfValidator.js';
import { checkUrlThreat } from './threatDetectionService.js';
import { ValidationError } from '../lib/errors.js';

/**
 * Validates one destination URL: http(s) scheme only, must not resolve to a
 * loopback/private/cloud-metadata address (SSRF), and must not be flagged
 * by threat intel. Shared by every field that can redirect a visitor, on
 * both create and update, from both the dashboard and public APIs — a
 * field validated only at creation is a field an attacker can plant safely
 * and then repoint after the fact.
 * @param {string} url
 * @param {string} fieldName - used only in the error message
 */
export async function assertSafeRedirectUrl(url, fieldName) {
  const safety = await validateUrlSafety(url);
  if (!safety.safe) {
    throw new ValidationError(`${fieldName}: ${safety.reason}`);
  }

  const threat = await checkUrlThreat(url);
  if (threat.malicious) {
    throw new ValidationError(`${fieldName}: URL flagged as malicious and cannot be used`);
  }
}

/**
 * Validates every redirect-capable field present on a link create/update
 * payload: originalUrl, iosRedirect, androidRedirect, expiredRedirectUrl,
 * and variants[].url. Absent/empty fields are skipped (they're optional).
 * @param {Record<string, unknown>} payload
 */
export async function validateLinkRedirectFields(payload) {
  const checks = [];

  if (payload.originalUrl) checks.push(assertSafeRedirectUrl(payload.originalUrl, 'originalUrl'));
  if (payload.iosRedirect) checks.push(assertSafeRedirectUrl(payload.iosRedirect, 'iosRedirect'));
  if (payload.androidRedirect) checks.push(assertSafeRedirectUrl(payload.androidRedirect, 'androidRedirect'));
  if (payload.expiredRedirectUrl) {
    checks.push(assertSafeRedirectUrl(payload.expiredRedirectUrl, 'expiredRedirectUrl'));
  }

  if (Array.isArray(payload.variants)) {
    payload.variants.forEach((variant, i) => {
      if (variant?.url) checks.push(assertSafeRedirectUrl(variant.url, `variants[${i}].url`));
    });
  }

  await Promise.all(checks);
}

export default { assertSafeRedirectUrl, validateLinkRedirectFields };
