import { describe, it } from 'vitest';
import assert from 'node:assert';
import {
  WEBHOOK_EVENT_TYPES,
  normalizeEventType,
  normalizeSubscriptions,
  subscriptionNamesFor,
  sampleEventData,
  describeEventCatalog,
} from '../../src/lib/webhookEvents.js';

describe('webhook event catalog', () => {
  it('maps legacy aliases to canonical types and rejects unknown names', () => {
    assert.strictEqual(normalizeEventType('click'), 'link.clicked');
    assert.strictEqual(normalizeEventType('abuse.flagged'), 'security.abuse_flagged');
    assert.strictEqual(normalizeEventType('link.created'), 'link.created');
    assert.strictEqual(normalizeEventType('link.exploded'), null);
    assert.strictEqual(normalizeEventType(42), null);
  });

  it('canonicalises and de-duplicates a subscription list, reporting invalid entries', () => {
    assert.deepStrictEqual(normalizeSubscriptions(['click', 'link.clicked', 'nope', 'link.created']), {
      events: ['link.clicked', 'link.created'],
      invalid: ['nope'],
    });
    assert.deepStrictEqual(normalizeSubscriptions('click'), { events: [], invalid: [] });
  });

  it('matches stored subscriptions under either the canonical name or an alias', () => {
    assert.deepStrictEqual(subscriptionNamesFor('link.clicked'), ['link.clicked', 'click']);
    assert.deepStrictEqual(subscriptionNamesFor('link.deleted'), ['link.deleted']);
  });

  it('has a sample payload for every type, keyed by the fields the producers send', () => {
    for (const type of WEBHOOK_EVENT_TYPES) {
      const sample = sampleEventData(type);
      assert.strictEqual(typeof sample, 'object');
      if (type.startsWith('link.') || type.startsWith('security.')) assert.ok(sample.linkId, `${type} sample has linkId`);
    }
    const clicked = sampleEventData('click');
    assert.ok('referrerDomain' in clicked && 'utm' in clicked && 'isBot' in clicked);
  });

  it('describes the catalog in a stable order for the dashboard', () => {
    const catalog = describeEventCatalog();
    assert.deepStrictEqual(
      catalog.map((e) => e.type),
      WEBHOOK_EVENT_TYPES
    );
    assert.ok(catalog.every((e) => e.description && Array.isArray(e.aliases) && e.sample));
  });
});
