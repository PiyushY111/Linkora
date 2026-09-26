import { describe, it, expect } from 'vitest';
import {
  capacityPercent,
  capacityTone,
  formatDayLabel,
  toChartSeries,
  sumDaily,
  mostRecentlyUsedKey,
} from '../components/developer/UsageDashboard/usageHelpers.js';

describe('usageHelpers', () => {
  describe('capacityPercent', () => {
    it('rounds the remaining share of the bucket and clamps it to 0-100', () => {
      expect(capacityPercent(15, 30)).toBe(50);
      expect(capacityPercent(1, 3)).toBe(33);
      expect(capacityPercent(30, 30)).toBe(100);
      expect(capacityPercent(45, 30)).toBe(100);
      expect(capacityPercent(-1, 30)).toBe(0);
    });

    it('returns 0 for a missing or zero capacity instead of NaN/Infinity', () => {
      expect(capacityPercent(5, 0)).toBe(0);
      expect(capacityPercent(5, undefined)).toBe(0);
    });
  });

  describe('capacityTone', () => {
    it('marks the bucket healthy at 50%+, low below 50%, critical below 20%', () => {
      expect(capacityTone(100)).toBe('ok');
      expect(capacityTone(50)).toBe('ok');
      expect(capacityTone(49)).toBe('low');
      expect(capacityTone(20)).toBe('low');
      expect(capacityTone(19)).toBe('critical');
      expect(capacityTone(0)).toBe('critical');
    });
  });

  describe('formatDayLabel', () => {
    it('formats the UTC day itself, never the neighbouring day', () => {
      const label = formatDayLabel('2026-09-01');
      expect(label).toMatch(/1/);
      expect(label).not.toMatch(/31/);
    });

    it('returns malformed input unchanged', () => {
      expect(formatDayLabel('not-a-date')).toBe('not-a-date');
    });
  });

  describe('toChartSeries', () => {
    it('splits each day into stacked success and error counts, keeping zero days', () => {
      const series = toChartSeries([
        { date: '2026-09-25', count: 0, errorCount: 0 },
        { date: '2026-09-26', count: 10, errorCount: 3 },
      ]);

      expect(series.map(({ successCount, errorCount, count }) => ({ successCount, errorCount, count }))).toEqual([
        { successCount: 0, errorCount: 0, count: 0 },
        { successCount: 7, errorCount: 3, count: 10 },
      ]);
      expect(series[1].label).toBe(formatDayLabel('2026-09-26'));
    });
  });

  describe('sumDaily', () => {
    it('totals requests and errors across the window', () => {
      expect(
        sumDaily([
          { count: 3, errorCount: 1 },
          { count: 0, errorCount: 0 },
          { count: 5, errorCount: 2 },
        ])
      ).toEqual({ count: 8, errorCount: 3 });
      expect(sumDaily([])).toEqual({ count: 0, errorCount: 0 });
    });
  });

  describe('mostRecentlyUsedKey', () => {
    it('picks the key with the latest lastUsedAt, not the first in the list', () => {
      const keys = [
        { _id: 'newest', lastUsedAt: '2026-09-20T10:00:00.000Z' },
        { _id: 'middle', lastUsedAt: '2026-09-26T09:00:00.000Z' },
        { _id: 'oldest', lastUsedAt: null },
      ];
      expect(mostRecentlyUsedKey(keys)._id).toBe('middle');
    });

    it('ranks never-used keys last and falls back to list order when none were used', () => {
      expect(mostRecentlyUsedKey([{ _id: 'a' }, { _id: 'b', lastUsedAt: '2026-01-01T00:00:00.000Z' }])._id).toBe('b');
      expect(mostRecentlyUsedKey([{ _id: 'a', lastUsedAt: null }, { _id: 'b' }])._id).toBe('a');
    });

    it('returns undefined for no keys', () => {
      expect(mostRecentlyUsedKey([])).toBeUndefined();
    });
  });
});
