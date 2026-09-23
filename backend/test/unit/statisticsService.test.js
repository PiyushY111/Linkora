import { describe, it } from 'vitest';
import assert from 'node:assert';
import { calculateAbTestStatistics } from '../../src/services/statisticsService.js';

describe('A/B Testing Statistical Significance Engine', () => {
  it('returns collecting_data when clicks are low (<10)', () => {
    const variants = [
      { id: 'v1', name: 'Variant A', url: 'https://a.com', weight: 50, clicks: 3 },
      { id: 'v2', name: 'Variant B', url: 'https://b.com', weight: 50, clicks: 2 },
    ];
    const result = calculateAbTestStatistics(variants);
    assert.strictEqual(result.status, 'collecting_data');
    assert.strictEqual(result.totalClicks, 5);
    assert.strictEqual(result.isSignificant, false);
  });

  it('calculates correct statistical significance when one variant dominates with sufficient traffic', () => {
    // 200 clicks total: Variant A has 140 (70%), Variant B has 60 (30%) against a 50/50 baseline
    const variants = [
      { id: 'v1', name: 'Variant A', url: 'https://a.com', weight: 50, clicks: 140 },
      { id: 'v2', name: 'Variant B', url: 'https://b.com', weight: 50, clicks: 60 },
    ];
    const result = calculateAbTestStatistics(variants);
    assert.strictEqual(result.hasTest, true);
    assert.strictEqual(result.totalClicks, 200);
    assert.strictEqual(result.isSignificant, true);
    assert.ok(result.pValue < 0.01, `Expected pValue < 0.01 but got ${result.pValue}`);
    assert.ok(result.confidence > 99, `Expected confidence > 99 but got ${result.confidence}`);
    assert.strictEqual(result.leadingVariant.name, 'Variant A');
  });

  it('calculates inconclusive when variants are closely tied at 50/50', () => {
    const variants = [
      { id: 'v1', name: 'Variant A', url: 'https://a.com', weight: 50, clicks: 102 },
      { id: 'v2', name: 'Variant B', url: 'https://b.com', weight: 50, clicks: 98 },
    ];
    const result = calculateAbTestStatistics(variants);
    assert.strictEqual(result.hasTest, true);
    assert.strictEqual(result.isSignificant, false);
    assert.ok(result.pValue > 0.5, `Expected pValue > 0.5 but got ${result.pValue}`);
  });
});
