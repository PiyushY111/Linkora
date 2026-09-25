import validator from 'validator';

/**
 * The normalization register applies to emails (validator.normalizeEmail),
 * so an invite, a directory-provisioned account and a self-registered one
 * all compare equal.
 * @param {unknown} email
 * @returns {string | null} null if not a valid email
 */
export function normalizeAccountEmail(email) {
  if (typeof email !== 'string' || !validator.isEmail(email.trim())) return null;
  return validator.normalizeEmail(email.trim()) || null;
}

export default normalizeAccountEmail;
