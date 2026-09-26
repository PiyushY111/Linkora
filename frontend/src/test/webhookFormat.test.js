import { describe, it, expect } from 'vitest';
import {
  endpointHealth,
  deliveryStatusLabel,
  deliveryStatusMeta,
  eventMeta,
  headersToText,
} from '../components/webhooks/webhookFormat.js';

describe('endpointHealth', () => {
  it('reports why an inactive endpoint is off', () => {
    expect(endpointHealth({ isActive: false, disabledReason: 'manual' })).toEqual({ label: 'Paused', tone: 'off' });
    expect(endpointHealth({ isActive: false, disabledReason: 'gone' }).tone).toBe('bad');
    expect(endpointHealth({ isActive: false, disabledReason: 'failing' }).label).toMatch(/72h/);
  });

  it('reflects the circuit breaker on an active endpoint', () => {
    expect(endpointHealth({ isActive: true, circuit: { state: 'open', openUntil: new Date().toISOString() } }).tone).toBe('bad');
    expect(endpointHealth({ isActive: true, circuit: { state: 'half_open' } })).toEqual({ label: 'Probing recovery', tone: 'warn' });
    expect(endpointHealth({ isActive: true, circuit: { state: 'closed', consecutiveFailures: 3 } }).label).toMatch(/3 failing/);
    expect(endpointHealth({ isActive: true, circuit: { state: 'closed', consecutiveFailures: 0 } })).toEqual({
      label: 'Operational',
      tone: 'ok',
    });
  });
});

describe('delivery display', () => {
  it('calls an unattempted pending delivery queued and an attempted one retrying', () => {
    expect(deliveryStatusLabel({ status: 'pending', attemptCount: 0 })).toBe('Queued');
    expect(deliveryStatusLabel({ status: 'pending', attemptCount: 2 })).toBe('Retrying');
    expect(deliveryStatusLabel({ status: 'succeeded', attemptCount: 1 })).toBe('Delivered');
  });

  it('falls back gracefully for unknown statuses and events', () => {
    expect(deliveryStatusMeta('weird').label).toBe('weird');
    expect(eventMeta('custom.event').label).toBe('custom.event');
  });

  it('renders headers one per line', () => {
    expect(headersToText({ a: '1', b: '2' })).toBe('a: 1\nb: 2');
    expect(headersToText(undefined)).toBe('None recorded');
  });
});
