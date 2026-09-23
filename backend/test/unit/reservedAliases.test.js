import { describe, it } from 'vitest';
import assert from 'node:assert';
import { isReservedAlias } from '../../src/lib/reservedAliases.js';

describe('isReservedAlias', () => {
  it('flags known dashboard/API route names', () => {
    for (const alias of ['dashboard', 'login', 'settings', 'api', 'admin', 'sso']) {
      assert.strictEqual(isReservedAlias(alias), true, `expected "${alias}" to be reserved`);
    }
  });

  it('is case-insensitive', () => {
    assert.strictEqual(isReservedAlias('Login'), true);
    assert.strictEqual(isReservedAlias('DASHBOARD'), true);
  });

  it('does not flag an ordinary alias', () => {
    assert.strictEqual(isReservedAlias('my-cool-link'), false);
    assert.strictEqual(isReservedAlias('promo2026'), false);
  });
});
