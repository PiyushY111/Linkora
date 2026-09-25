import { describe, it } from 'vitest';
import assert from 'node:assert';
import {
  PERMISSIONS,
  hasPermission,
  permissionDeniedMessage,
  permissionsForRole,
  requiredRole,
} from '../../src/utils/permissions.js';

// The matrix as specified, written out independently of the table so a
// change to the table has to be a deliberate change here too.
const EXPECTED = {
  viewer: ['links:read', 'analytics:read'],
  creator: ['links:read', 'links:write', 'analytics:read', 'analytics:detail', 'analytics:export'],
  admin: [
    'links:read',
    'links:write',
    'analytics:read',
    'analytics:detail',
    'analytics:export',
    'apiKeys:manage',
    'webhooks:manage',
    'domains:manage',
    'members:manage',
    'roles:manage',
    'settings:manage',
    'activity:read',
  ],
  owner: Object.keys(PERMISSIONS),
};

describe('workspace permission matrix', () => {
  for (const [role, allowed] of Object.entries(EXPECTED)) {
    it(`${role} gets exactly its permissions`, () => {
      assert.deepStrictEqual([...permissionsForRole(role)].sort(), [...allowed].sort());
    });
  }

  it('owner-only actions exist for future endpoints', () => {
    for (const action of ['ownership:transfer', 'workspace:delete', 'organization:delete', 'billing:manage']) {
      assert.strictEqual(requiredRole(action), 'owner');
      assert.strictEqual(hasPermission('admin', action), false);
    }
  });

  it('denies unknown or missing roles', () => {
    assert.strictEqual(hasPermission(undefined, 'links:read'), false);
    assert.strictEqual(hasPermission('superuser', 'links:read'), false);
    assert.deepStrictEqual(permissionsForRole(undefined), []);
  });

  it('throws on an unknown action instead of silently allowing or denying', () => {
    assert.throws(() => hasPermission('owner', 'links:wirte'), /Unknown permission action/);
  });

  it('uses the same 403 wording as the route guards', () => {
    assert.strictEqual(permissionDeniedMessage('links:write'), 'Requires creator role or higher');
    assert.strictEqual(permissionDeniedMessage('webhooks:manage'), 'Requires admin role or higher');
  });
});
