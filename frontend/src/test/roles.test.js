import { describe, it, expect } from 'vitest';
import { roleLabel, roleOptions } from '../utils/roles.js';

describe('roleLabel', () => {
  it('shows built-in roles as-is and custom role ids by name', () => {
    expect(roleLabel('admin')).toBe('admin');
    expect(roleLabel('65f0c0ffee0000000000abcd', { '65f0c0ffee0000000000abcd': 'Analyst' })).toBe('Analyst');
  });

  it('never shows a raw id', () => {
    expect(roleLabel('65f0c0ffee0000000000abcd', {})).toBe('Custom role');
    expect(roleLabel(undefined)).toBe('—');
  });
});

describe('roleOptions', () => {
  it('lists assignable built-in roles, then custom roles, and never owner', () => {
    const options = roleOptions([{ id: 'r1', name: 'Analyst' }]);
    expect(options.map((o) => o.value)).toEqual(['viewer', 'creator', 'admin', 'r1']);
    expect(options.at(-1)).toEqual({ value: 'r1', label: 'Analyst', custom: true });
  });
});
