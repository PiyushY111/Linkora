/**
 * Breakdown dimensions kept in the link_stats_* rollups, and the rules that
 * keep each rollup document bounded.
 *
 * Each dimension map holds at most `cap` distinct values per document. Once
 * full, values not already present are counted under OTHER_KEY. That makes
 * each map "the first N values seen in this bucket, plus other" rather than
 * a true top N, which is the price of an O(1) update. Buckets are an hour or
 * a day, so the set starts fresh often.
 */

export const OTHER_KEY = '__other__';

const LOCAL_REFERRER = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

/** @type {Record<string, { cap: number, value: (e: import('./analyticsRepository.js').ClickEventRecord) => string }>} */
export const DIMENSIONS = {
  country: { cap: 60, value: (e) => e.country || '' },
  // Cities are only meaningful with their country: "CC|City".
  city: { cap: 50, value: (e) => (e.city ? `${e.country || ''}|${e.city}` : '') },
  device: { cap: 10, value: (e) => e.device || '' },
  browser: { cap: 30, value: (e) => e.browser || '' },
  os: { cap: 30, value: (e) => e.os || '' },
  referrer: {
    cap: 50,
    value: (e) => (!e.referrerDomain || LOCAL_REFERRER.test(e.referrerDomain) ? 'Direct' : e.referrerDomain),
  },
  utmSource: { cap: 30, value: (e) => e.utmSource || '' },
  utmMedium: { cap: 30, value: (e) => e.utmMedium || '' },
  utmCampaign: { cap: 30, value: (e) => e.utmCampaign || '' },
  variant: { cap: 20, value: (e) => e.variantId || '' },
};

export const DIMENSION_NAMES = Object.keys(DIMENSIONS);

/**
 * MongoDB field names can't contain '.' or start with '$', and referrer
 * domains always contain dots. Percent-encode just those characters (and
 * '%' itself, so decoding is unambiguous).
 * @param {string} value
 */
export function encodeKey(value) {
  return value.replace(/%/g, '%25').replace(/\./g, '%2E').replace(/\$/g, '%24');
}

/** @param {string} key */
export function decodeKey(key) {
  return key.replace(/%24/g, '$').replace(/%2E/g, '.').replace(/%25/g, '%');
}

/**
 * Tracks which encoded keys each rollup document already holds, and decides
 * per event whether a value gets its own key or falls into OTHER_KEY.
 * Seeded from the documents' current dims; updated as the batch assigns new
 * keys, so a batch can never push a map past its cap on its own. (Two
 * consumers updating the same document concurrently can each add up to
 * their batch's worth of keys, so the hard bound is cap + concurrent batches.)
 */
export class DimensionKeyAssigner {
  constructor() {
    /** @type {Map<string, Map<string, Set<string>>>} docKey -> dimension -> encoded keys */
    this.known = new Map();
  }

  /**
   * @param {string} docKey
   * @param {Record<string, Record<string, unknown>> | undefined} dims
   */
  seed(docKey, dims) {
    const perDim = new Map();
    for (const name of DIMENSION_NAMES) {
      const keys = Object.keys(dims?.[name] || {}).filter((k) => k !== OTHER_KEY);
      perDim.set(name, new Set(keys));
    }
    this.known.set(docKey, perDim);
  }

  /**
   * @param {string} docKey
   * @param {import('./analyticsRepository.js').ClickEventRecord} event
   * @returns {Record<string, string>} dimension -> encoded key (dimensions with no value are omitted)
   */
  assign(docKey, event) {
    if (!this.known.has(docKey)) this.seed(docKey, undefined);
    const perDim = this.known.get(docKey);
    const assigned = {};
    for (const [name, { cap, value }] of Object.entries(DIMENSIONS)) {
      const raw = value(event);
      if (!raw) continue;
      const key = encodeKey(raw);
      const keys = perDim.get(name);
      if (keys.has(key)) {
        assigned[name] = key;
      } else if (keys.size < cap) {
        keys.add(key);
        assigned[name] = key;
      } else {
        assigned[name] = OTHER_KEY;
      }
    }
    return assigned;
  }
}
