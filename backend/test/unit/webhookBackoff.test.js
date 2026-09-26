import { describe, it } from 'vitest';
import assert from 'node:assert';
import { backoffAfter, RETRY_SCHEDULE_MS, MAX_ATTEMPTS } from '../../src/services/webhookDelivery.js';

describe('webhook retry backoff', () => {
  it('spans roughly a day across MAX_ATTEMPTS attempts', () => {
    const total = RETRY_SCHEDULE_MS.reduce((a, b) => a + b, 0);
    assert.strictEqual(MAX_ATTEMPTS, RETRY_SCHEDULE_MS.length + 1);
    assert.ok(total > 20 * 60 * 60_000 && total < 30 * 60 * 60_000, `total ${total}`);
  });

  it('grows with the attempt number, within ±20% jitter', () => {
    for (let n = 1; n <= RETRY_SCHEDULE_MS.length; n += 1) {
      const scheduled = RETRY_SCHEDULE_MS[n - 1];
      for (let i = 0; i < 20; i += 1) {
        const delay = backoffAfter(n);
        assert.ok(delay >= scheduled * 0.8 && delay <= scheduled * 1.2, `attempt ${n}: ${delay} vs ${scheduled}`);
      }
    }
  });

  it('never waits less than an endpoint’s Retry-After', () => {
    assert.ok(backoffAfter(1, 90_000) >= 90_000);
    assert.ok(backoffAfter(1, 1_000) >= RETRY_SCHEDULE_MS[0] * 0.8);
  });

  it('caps at the last schedule entry beyond the table', () => {
    const last = RETRY_SCHEDULE_MS[RETRY_SCHEDULE_MS.length - 1];
    const delay = backoffAfter(RETRY_SCHEDULE_MS.length + 5);
    assert.ok(delay >= last * 0.8 && delay <= last * 1.2);
  });
});
