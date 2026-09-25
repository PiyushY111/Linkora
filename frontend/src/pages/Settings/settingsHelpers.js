export const MIN_PASSWORD_LENGTH = 6;
const STRONG_PASSWORD_LENGTH = 10;

/** Strength-bar class and label for a new password (length-based). */
export function getPasswordStrength(password) {
  if (password.length < MIN_PASSWORD_LENGTH) return { barClass: 'w-1/4 bg-rose-500', label: 'Too short' };
  if (password.length < STRONG_PASSWORD_LENGTH) return { barClass: 'w-2/3 bg-amber-400', label: 'Moderate' };
  return { barClass: 'w-full bg-emerald-400', label: 'Strong' };
}

/** The toast message for an invalid change-password form, or null if it's valid. */
export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword) return 'Please enter your current password';
  if (newPassword.length < MIN_PASSWORD_LENGTH) return 'New password must be at least 6 characters';
  if (newPassword !== confirmPassword) return 'New passwords do not match';
  return null;
}

/** YYYY-MM-DD (UTC), used in export file names. */
export function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Saves a Blob through a temporary download link. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
