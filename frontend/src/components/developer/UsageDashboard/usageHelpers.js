// The token bucket refills every second; polling faster than this would
// mostly redraw the same number.
export const USAGE_POLL_INTERVAL_MS = 12_000;

export const HISTORY_RANGE_OPTIONS = [7, 30];

/**
 * Share of the burst bucket still available, as a 0-100 integer.
 * @param {number} remaining
 * @param {number} capacity
 * @returns {number}
 */
export function capacityPercent(remaining, capacity) {
  if (!capacity || capacity <= 0) return 0;
  const percent = Math.round((remaining / capacity) * 100);
  return Math.min(100, Math.max(0, percent));
}

/**
 * Semantic tone for the gauge: healthy, running low, or nearly throttled.
 * @param {number} percent
 * @returns {'ok' | 'low' | 'critical'}
 */
export function capacityTone(percent) {
  if (percent < 20) return 'critical';
  if (percent < 50) return 'low';
  return 'ok';
}

/**
 * 'YYYY-MM-DD' (a UTC day from the API) -> 'Sep 26'. Formatted from the
 * date parts in UTC so the label never shifts to the neighbouring day in
 * the viewer's timezone.
 * @param {string} date
 * @returns {string}
 */
export function formatDayLabel(date) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Splits each day's total into successful and failed requests so the chart
 * can stack them.
 * @param {{ date: string, count: number, errorCount: number }[]} daily
 */
export function toChartSeries(daily = []) {
  return daily.map(({ date, count, errorCount }) => ({
    date,
    label: formatDayLabel(date),
    successCount: Math.max(0, count - errorCount),
    errorCount,
    count,
  }));
}

/**
 * @param {{ count: number, errorCount: number }[]} daily
 * @returns {{ count: number, errorCount: number }}
 */
export function sumDaily(daily = []) {
  return daily.reduce(
    (totals, day) => ({ count: totals.count + day.count, errorCount: totals.errorCount + day.errorCount }),
    { count: 0, errorCount: 0 }
  );
}

/**
 * The key to show first: the most recently used one. Keys that have never
 * been used rank last; among those (or on a tie) the list's own order wins,
 * which the API returns newest first.
 * @template {{ lastUsedAt?: string | null }} K
 * @param {K[]} keys
 * @returns {K | undefined}
 */
export function mostRecentlyUsedKey(keys = []) {
  const lastUsed = (key) => (key.lastUsedAt ? new Date(key.lastUsedAt).getTime() || 0 : 0);
  return keys.reduce((best, key) => (best === undefined || lastUsed(key) > lastUsed(best) ? key : best), undefined);
}
