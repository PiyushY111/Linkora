import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('XFetch Probabilistic Early Expiration Mathematical Model', () => {
  it('correctly calculates XFetch threshold behavior', () => {
    const delta = 25; // 25ms compute time
    const beta = 1.0;
    
    // As remaining time is large (e.g. 50,000ms), probability of early recomputation should be near 0
    const remainingMsLarge = 50000;
    let triggersWhenFresh = 0;
    for (let i = 0; i < 1000; i++) {
      const rand = Math.random();
      const xfetchVal = delta * beta * (-Math.log(rand || 0.0001));
      if (xfetchVal >= remainingMsLarge) triggersWhenFresh++;
    }
    assert.strictEqual(triggersWhenFresh, 0);

    // When remaining time is small (e.g. 10ms), probability of triggering early recompute is high
    const remainingMsSmall = 10;
    let triggersWhenExpiring = 0;
    for (let i = 0; i < 1000; i++) {
      const rand = Math.random();
      const xfetchVal = delta * beta * (-Math.log(rand || 0.0001));
      if (xfetchVal >= remainingMsSmall) triggersWhenExpiring++;
    }
    // Mathematically: P(-ln(U) >= 10/25 = 0.4) = e^(-0.4) ≈ 0.67 (67%)
    assert.ok(
      triggersWhenExpiring > 500,
      `Expected > 500 triggers out of 1000, got ${triggersWhenExpiring}`
    );
  });
});
