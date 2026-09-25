import { describe, it, expect } from 'vitest';
import { getPasswordStrength, validatePasswordChange, dateStamp } from '../pages/Settings/settingsHelpers.js';

describe('settingsHelpers', () => {
  describe('getPasswordStrength', () => {
    it('is too short below 6 characters', () => {
      expect(getPasswordStrength('12345')).toEqual({ barClass: 'w-1/4 bg-rose-500', label: 'Too short' });
    });

    it('is moderate from 6 to 9 characters', () => {
      expect(getPasswordStrength('123456').label).toBe('Moderate');
      expect(getPasswordStrength('123456789')).toEqual({ barClass: 'w-2/3 bg-amber-400', label: 'Moderate' });
    });

    it('is strong from 10 characters', () => {
      expect(getPasswordStrength('1234567890')).toEqual({ barClass: 'w-full bg-emerald-400', label: 'Strong' });
    });
  });

  describe('validatePasswordChange', () => {
    const valid = { currentPassword: 'old', newPassword: 'secret1', confirmPassword: 'secret1' };

    it('checks current password, then length, then confirmation', () => {
      expect(validatePasswordChange({ ...valid, currentPassword: '', newPassword: '1' })).toBe(
        'Please enter your current password'
      );
      expect(validatePasswordChange({ ...valid, newPassword: '12345', confirmPassword: 'other' })).toBe(
        'New password must be at least 6 characters'
      );
      expect(validatePasswordChange({ ...valid, confirmPassword: 'secret2' })).toBe('New passwords do not match');
    });

    it('returns null for a valid change', () => {
      expect(validatePasswordChange(valid)).toBeNull();
    });
  });

  it('dateStamp formats the UTC date as YYYY-MM-DD', () => {
    expect(dateStamp(new Date('2026-09-25T23:59:59.000Z'))).toBe('2026-09-25');
  });
});
