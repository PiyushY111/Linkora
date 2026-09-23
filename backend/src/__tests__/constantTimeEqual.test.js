import { describe, it } from 'vitest';
import assert from 'node:assert';
import { constantTimeEqual } from '../utils/constantTimeEqual.js';

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    assert.strictEqual(constantTimeEqual('super-secret-token', 'super-secret-token'), true);
  });

  it('returns false for different strings of the same length', () => {
    assert.strictEqual(constantTimeEqual('super-secret-token', 'super-secret-tokeN'), false);
  });

  it('returns false for different-length strings without throwing', () => {
    assert.strictEqual(constantTimeEqual('short', 'a-much-longer-value'), false);
  });

  it('treats undefined/empty inputs safely', () => {
    assert.strictEqual(constantTimeEqual(undefined, ''), true);
    assert.strictEqual(constantTimeEqual(undefined, 'x'), false);
  });
});
