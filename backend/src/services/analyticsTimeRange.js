/**
 * Time-range math shared by the analytics controller and the analytics
 * repository: resolving a named range to concrete bounds, the comparison
 * period, and a zero-filled time series for charting.
 */

/**
 * Computes time range boundaries, comparison periods, and appropriate
 * interval granularity (hour vs day vs month).
 */
export function calculateTimeRange(timeRange = '30d', customStart, customEnd) {
  const now = new Date();
  let start, end;
  let granularity = 'day';

  switch (timeRange) {
    case 'today':
    case '24h': {
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      end = now;
      granularity = 'hour';
      break;
    }
    case '7d': {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      end = now;
      granularity = 'day';
      break;
    }
    case '30d': {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = now;
      granularity = 'day';
      break;
    }
    case '90d': {
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      end = now;
      granularity = 'day';
      break;
    }
    case 'ytd': {
      start = new Date(now.getFullYear(), 0, 1);
      end = now;
      granularity = 'month';
      break;
    }
    case 'all': {
      start = new Date(2020, 0, 1);
      end = now;
      granularity = 'month';
      break;
    }
    case 'custom':
    default: {
      let e = now;
      if (customEnd) {
        if (typeof customEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(customEnd.trim())) {
          e = new Date(`${customEnd.trim()}T23:59:59.999Z`);
        } else {
          e = new Date(customEnd);
        }
      }
      let s;
      if (customStart) {
        if (typeof customStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(customStart.trim())) {
          s = new Date(`${customStart.trim()}T00:00:00.000Z`);
        } else {
          s = new Date(customStart);
        }
      } else {
        s = new Date(e.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      if (isNaN(s.getTime())) s = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (isNaN(e.getTime())) e = now;

      if (s.getTime() > e.getTime()) {
        const tmp = s;
        s = e;
        e = tmp;
      }

      start = s;
      end = e;
      const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      granularity = diffDays <= 2 ? 'hour' : diffDays <= 90 ? 'day' : 'month';
      break;
    }
  }

  const durationMs = Math.max(60000, end.getTime() - start.getTime());
  const priorEnd = new Date(start.getTime());
  const priorStart = new Date(start.getTime() - durationMs);

  return {
    start,
    end,
    priorStart,
    priorEnd,
    granularity,
    timeRange,
  };
}

export function calculateGrowth(current, prior) {
  if (!prior || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

export function fillTimeSeries(rows, start, end, granularity) {
  const map = new Map();
  for (const r of rows) {
    if (r.day) {
      let key = String(r.day);
      if (key.length >= 19) {
        key = key.slice(0, 13) + ':00';
      }
      map.set(key, Number(r.clicks) || 0);
    }
  }

  const result = [];
  const current = new Date(start);
  const finish = new Date(end);

  if (granularity === 'hour') {
    current.setUTCMinutes(0, 0, 0);
    while (current <= finish) {
      const yyyy = current.getUTCFullYear();
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(current.getUTCDate()).padStart(2, '0');
      const hh = String(current.getUTCHours()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd} ${hh}:00`;
      result.push({ day: key, clicks: map.get(key) || 0 });
      current.setUTCHours(current.getUTCHours() + 1);
    }
  } else if (granularity === 'day') {
    current.setUTCHours(0, 0, 0, 0);
    while (current <= finish) {
      const yyyy = current.getUTCFullYear();
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(current.getUTCDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      result.push({ day: key, clicks: map.get(key) || 0 });
      current.setUTCDate(current.getUTCDate() + 1);
    }
  } else {
    current.setUTCDate(1);
    current.setUTCHours(0, 0, 0, 0);
    while (current <= finish) {
      const yyyy = current.getUTCFullYear();
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
      const key = `${yyyy}-${mm}`;
      result.push({ day: key, clicks: map.get(key) || 0 });
      current.setUTCMonth(current.getUTCMonth() + 1);
    }
  }

  return result;
}
