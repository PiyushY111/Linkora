/**
 * The webhook event catalog: every event type Linkora emits, what its
 * `data` carries, and a realistic sample of it. Dispatch, subscription
 * validation, the test-ping sample and the dashboard's catalog all read
 * from here, so the documented shape and the delivered shape are one thing.
 */

const SAMPLE_LINK = {
  linkId: '6ab2805b12cad4d2d0337fc5',
  shortCode: 'demo2026',
  originalUrl: 'https://example.com/product-showcase',
};

/** @type {Record<string, { description: string, aliases: string[], sample: () => Record<string, unknown> }>} */
export const WEBHOOK_EVENT_CATALOG = {
  'link.clicked': {
    description: 'A short link was visited. Sent once per click after analytics enrichment (GeoIP, device).',
    aliases: ['click'],
    sample: () => ({
      ...SAMPLE_LINK,
      timestamp: new Date().toISOString(),
      ip: '203.0.113.42',
      country: 'US',
      city: 'San Francisco',
      device: 'desktop',
      browser: 'Chrome',
      os: 'macOS',
      referrerDomain: 'twitter.com',
      utm: { source: 'twitter', medium: 'social', campaign: 'spring_launch' },
      isBot: false,
    }),
  },
  'link.created': {
    description: 'A short link was created from the dashboard or the public API.',
    aliases: [],
    sample: () => ({ ...SAMPLE_LINK, title: 'Spring Product Showcase', createdAt: new Date().toISOString() }),
  },
  'link.updated': {
    description: 'A link’s destination, title or settings were changed.',
    aliases: [],
    sample: () => ({ ...SAMPLE_LINK, title: 'Spring Product Showcase', updatedAt: new Date().toISOString() }),
  },
  'link.deleted': {
    description: 'A link was deleted.',
    aliases: [],
    sample: () => ({ ...SAMPLE_LINK, deletedAt: new Date().toISOString() }),
  },
  'link.limit_reached': {
    description: 'A link hit its click cap and was deactivated.',
    aliases: [],
    sample: () => ({ ...SAMPLE_LINK, maxClicks: 100, totalClicks: 100 }),
  },
  'link.expired': {
    description: 'A link passed its expiry date. Sent once, by the 15-minute expiry sweep.',
    aliases: [],
    sample: () => ({ ...SAMPLE_LINK, expiryDate: new Date().toISOString() }),
  },
  'security.abuse_flagged': {
    description: 'Threat detection flagged a link as phishing/malware and deactivated it.',
    aliases: ['abuse.flagged'],
    sample: () => ({
      linkId: '6ab2805b12cad4d2d0337fc5',
      shortCode: 'phish99',
      originalUrl: 'http://malware-sample.invalid',
      source: 'safe_browsing',
    }),
  },
  'endpoint.test': {
    description: 'A synthetic ping sent from the dashboard’s test runner. Never retried; never affects endpoint health.',
    aliases: [],
    sample: () => ({ message: 'This is a test event from Linkora.', testTimestamp: new Date().toISOString() }),
  },
};

/** Canonical event type names, in catalog order. */
export const WEBHOOK_EVENT_TYPES = Object.freeze(Object.keys(WEBHOOK_EVENT_CATALOG));

const ALIAS_TO_CANONICAL = new Map(
  Object.entries(WEBHOOK_EVENT_CATALOG).flatMap(([type, def]) => def.aliases.map((alias) => [alias, type]))
);

/**
 * Maps an event name (canonical or legacy alias) to its canonical type, or
 * null when it isn't one Linkora emits.
 * @param {string} type
 * @returns {string | null}
 */
export function normalizeEventType(type) {
  if (typeof type !== 'string') return null;
  if (WEBHOOK_EVENT_CATALOG[type]) return type;
  return ALIAS_TO_CANONICAL.get(type) || null;
}

/**
 * Canonicalises a subscription list, dropping duplicates and unknown names.
 * @param {unknown} events
 * @returns {{ events: string[], invalid: string[] }}
 */
export function normalizeSubscriptions(events) {
  if (!Array.isArray(events)) return { events: [], invalid: [] };
  const invalid = events.filter((e) => normalizeEventType(e) === null).map(String);
  const normalized = [...new Set(events.map(normalizeEventType).filter(Boolean))];
  return { events: normalized, invalid };
}

/**
 * Every stored name that means `type`: the canonical one plus its legacy
 * aliases, so a subscription saved before the rename still matches.
 * @param {string} type canonical event type
 * @returns {string[]}
 */
export function subscriptionNamesFor(type) {
  const def = WEBHOOK_EVENT_CATALOG[type];
  return def ? [type, ...def.aliases] : [type];
}

/**
 * @param {string} type canonical event type
 * @returns {Record<string, unknown>}
 */
export function sampleEventData(type) {
  const def = WEBHOOK_EVENT_CATALOG[normalizeEventType(type) || 'endpoint.test'];
  return def.sample();
}

/** Catalog entries as the dashboard and the public API present them. */
export function describeEventCatalog() {
  return WEBHOOK_EVENT_TYPES.map((type) => ({
    type,
    description: WEBHOOK_EVENT_CATALOG[type].description,
    aliases: WEBHOOK_EVENT_CATALOG[type].aliases,
    sample: WEBHOOK_EVENT_CATALOG[type].sample(),
  }));
}

export default {
  WEBHOOK_EVENT_CATALOG,
  WEBHOOK_EVENT_TYPES,
  normalizeEventType,
  normalizeSubscriptions,
  subscriptionNamesFor,
  sampleEventData,
  describeEventCatalog,
};
