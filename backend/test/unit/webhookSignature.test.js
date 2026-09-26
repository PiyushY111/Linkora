import { describe, it } from 'vitest';
import assert from 'node:assert';
import crypto from 'crypto';
import { signPayload, verifySignature, computeSignature } from '../../src/lib/webhookSignature.js';

const body = JSON.stringify({ id: 'evt_1', type: 'link.created', data: { linkId: 'abc' } });
const secret = 'whsec_current';
const previous = 'whsec_previous';

describe('webhook signature', () => {
  it('signs as t=<ts>,v1=<hmac over "ts.body">', () => {
    const { header, timestamp } = signPayload(body, [secret], 1_700_000_000);
    const expected = crypto.createHmac('sha256', secret).update(`1700000000.${body}`).digest('hex');
    assert.strictEqual(timestamp, 1_700_000_000);
    assert.strictEqual(header, `t=1700000000,v1=${expected}`);
  });

  it('carries one v1 per active secret during a rotation grace period', () => {
    const { header } = signPayload(body, [secret, previous], 1_700_000_000);
    assert.strictEqual(header, `t=1700000000,v1=${computeSignature(body, secret, 1_700_000_000)},v1=${computeSignature(body, previous, 1_700_000_000)}`);
  });

  it('verifies with either secret while both are present, and only the current one after', () => {
    const now = 1_700_000_000;
    const both = signPayload(body, [secret, previous], now).header;
    assert.deepStrictEqual(verifySignature(both, body, secret, { now }), { valid: true });
    assert.deepStrictEqual(verifySignature(both, body, previous, { now }), { valid: true });

    const onlyCurrent = signPayload(body, [secret], now).header;
    assert.strictEqual(verifySignature(onlyCurrent, body, previous, { now }).valid, false);
  });

  it('rejects a tampered body, a wrong secret, and a stale timestamp', () => {
    const now = 1_700_000_000;
    const { header } = signPayload(body, [secret], now);
    assert.strictEqual(verifySignature(header, `${body} `, secret, { now }).valid, false);
    assert.strictEqual(verifySignature(header, body, 'whsec_other', { now }).valid, false);
    assert.deepStrictEqual(verifySignature(header, body, secret, { now: now + 301 }), { valid: false, reason: 'timestamp outside tolerance' });
    assert.deepStrictEqual(verifySignature(header, body, secret, { now: now + 300 }), { valid: true });
  });

  it('rejects malformed or missing headers without throwing', () => {
    assert.strictEqual(verifySignature(undefined, body, secret).valid, false);
    assert.strictEqual(verifySignature('garbage', body, secret).valid, false);
    assert.strictEqual(verifySignature('t=abc,v1=zz', body, secret).valid, false);
    assert.strictEqual(verifySignature('t=1700000000,v1=', body, secret, { now: 1_700_000_000 }).valid, false);
  });
});
