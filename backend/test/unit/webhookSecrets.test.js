import { describe, it } from 'vitest';
import assert from 'node:assert';
import {
  generateWebhookSecret,
  encryptWebhookSecret,
  decryptWebhookSecret,
  isEncryptedWebhookSecret,
  activeSigningSecrets,
} from '../../src/lib/webhookSecrets.js';

describe('webhook secrets at rest', () => {
  it('generates whsec_-prefixed secrets with 192 bits of entropy', () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    assert.match(a, /^whsec_[0-9a-f]{48}$/);
    assert.notStrictEqual(a, b);
  });

  it('round-trips through AES-256-GCM and never stores the plaintext', () => {
    const plain = generateWebhookSecret();
    const stored = encryptWebhookSecret(plain);
    assert.ok(isEncryptedWebhookSecret(stored));
    assert.ok(!stored.includes(plain));
    assert.strictEqual(decryptWebhookSecret(stored), plain);
    // A fresh IV every time: the same secret never encrypts to the same bytes.
    assert.notStrictEqual(encryptWebhookSecret(plain), stored);
  });

  it('refuses a ciphertext whose tag was tampered with', () => {
    const stored = encryptWebhookSecret('whsec_x');
    const parts = stored.split(':');
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('AA') ? 'BB' : 'AA');
    assert.throws(() => decryptWebhookSecret(parts.join(':')));
  });

  it('treats a legacy plaintext value as its own plaintext', () => {
    assert.strictEqual(decryptWebhookSecret('whsec_legacy'), 'whsec_legacy');
    assert.strictEqual(isEncryptedWebhookSecret('whsec_legacy'), false);
    assert.strictEqual(decryptWebhookSecret(null), null);
  });

  it('includes the previous secret only while its grace period is running', () => {
    const now = new Date('2026-09-27T00:00:00Z');
    const webhook = {
      secret: encryptWebhookSecret('whsec_new'),
      previousSecret: encryptWebhookSecret('whsec_old'),
      previousSecretExpiresAt: new Date('2026-09-28T00:00:00Z'),
    };
    assert.deepStrictEqual(activeSigningSecrets(webhook, now), ['whsec_new', 'whsec_old']);
    assert.deepStrictEqual(activeSigningSecrets(webhook, new Date('2026-09-29T00:00:00Z')), ['whsec_new']);
    assert.deepStrictEqual(activeSigningSecrets({ ...webhook, previousSecretExpiresAt: null }, now), ['whsec_new']);
  });
});
