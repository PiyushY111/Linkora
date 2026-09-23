import { describe, it, afterAll } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import { issueRefreshToken, consumeRefreshToken, revokeRefreshToken } from '../../src/utils/jwt.js';
import { redis } from '../../src/services/cacheService.js';

afterAll(async () => {
  await redis.quit();
});

describe('refresh token rotation', () => {
  it('issues a token that can be consumed exactly once', async () => {
    const userId = crypto.randomBytes(12).toString('hex');
    const token = await issueRefreshToken(userId);

    const first = await consumeRefreshToken(token);
    assert.ok(first);
    assert.strictEqual(first.userId, userId);

    const second = await consumeRefreshToken(token);
    assert.strictEqual(second, null, 'a spent token must not be redeemable again');
  });

  it('rejects a garbage token without throwing', async () => {
    assert.strictEqual(await consumeRefreshToken('not-a-real-token'), null);
    assert.strictEqual(await consumeRefreshToken(''), null);
    assert.strictEqual(await consumeRefreshToken(undefined), null);
  });

  it('keeps the family alive across a rotation (issue -> consume -> reissue -> consume)', async () => {
    const userId = crypto.randomBytes(12).toString('hex');
    const first = await issueRefreshToken(userId);

    const consumed1 = await consumeRefreshToken(first);
    assert.ok(consumed1);

    const second = await issueRefreshToken(consumed1.userId, consumed1.familyId);
    const consumed2 = await consumeRefreshToken(second);
    assert.ok(consumed2);
    assert.strictEqual(consumed2.familyId, consumed1.familyId);
    assert.strictEqual(consumed2.userId, userId);
  });

  it('detects reuse of an already-rotated-out token and revokes the whole family', async () => {
    const userId = crypto.randomBytes(12).toString('hex');
    const first = await issueRefreshToken(userId);

    const consumed1 = await consumeRefreshToken(first);
    const second = await issueRefreshToken(consumed1.userId, consumed1.familyId);

    // Replay the already-spent first token: this is exactly what a stolen,
    // already-used refresh token looks like from the server's perspective.
    const replay = await consumeRefreshToken(first);
    assert.strictEqual(replay, null, 'reuse of a spent token must be rejected');

    // The whole family — including the second, legitimately-issued token —
    // must now be dead, so the attacker's replay also logs out the victim.
    const secondAfterReuse = await consumeRefreshToken(second);
    assert.strictEqual(secondAfterReuse, null, 'reuse detection must revoke the entire family');
  });

  it('revokeRefreshToken kills the family immediately (logout)', async () => {
    const userId = crypto.randomBytes(12).toString('hex');
    const token = await issueRefreshToken(userId);

    await revokeRefreshToken(token);

    assert.strictEqual(await consumeRefreshToken(token), null);
  });
});
