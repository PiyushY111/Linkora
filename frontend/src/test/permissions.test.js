import { describe, it, expect } from 'vitest';
import { can } from '../utils/permissions.js';

describe('can', () => {
  it('reads the permission list the server sent for the active workspace', () => {
    const viewer = { role: 'viewer', permissions: ['links:read', 'analytics:read'] };
    expect(can(viewer, 'links:read')).toBe(true);
    expect(can(viewer, 'links:write')).toBe(false);
  });

  it('denies everything before a workspace is loaded', () => {
    expect(can(null, 'links:read')).toBe(false);
    expect(can({ role: 'owner' }, 'links:read')).toBe(false);
  });
});
