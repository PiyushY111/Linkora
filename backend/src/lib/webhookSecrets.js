import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Webhook signing secrets at rest. A secret is what lets anyone forge
 * events to a customer's endpoint, so it's stored AES-256-GCM encrypted
 * under WEBHOOK_SECRET_KEY rather than in the clear. Values written before
 * encryption existed (`whsec_…` in the clear) still decrypt to themselves;
 * scripts/encrypt-webhook-secrets.js re-saves them encrypted.
 */

const ENCRYPTED_PREFIX = 'enc:v1:';
const KEY_BYTES = 32;
const IV_BYTES = 12;

let cachedKey = null;

function deriveKey() {
  if (cachedKey) return cachedKey;
  const configured = env.WEBHOOK_SECRET_KEY;
  if (configured) {
    const raw = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64');
    if (raw.length !== KEY_BYTES) {
      throw new Error('WEBHOOK_SECRET_KEY must be 32 bytes, as 64 hex characters or base64');
    }
    cachedKey = raw;
  } else {
    // Development/test only (config/env.js requires the key in production):
    // derived so a fresh checkout works without one more variable.
    cachedKey = crypto.createHash('sha256').update(`webhook-secrets:${env.JWT_SECRET}`).digest();
  }
  return cachedKey;
}

/** A new signing secret in the format receivers see. */
export function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * @param {string} plain
 * @returns {string} `enc:v1:<iv>:<tag>:<ciphertext>` (base64url parts)
 */
export function encryptWebhookSecret(plain) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

/**
 * @param {string | null | undefined} stored
 * @returns {string | null} the plaintext secret, or null for an empty value
 */
export function decryptWebhookSecret(stored) {
  if (!stored) return null;
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;
  const [ivPart, tagPart, dataPart] = stored.slice(ENCRYPTED_PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
}

/** @param {string | null | undefined} stored */
export function isEncryptedWebhookSecret(stored) {
  return typeof stored === 'string' && stored.startsWith(ENCRYPTED_PREFIX);
}

/**
 * The secrets a delivery must be signed with right now: the current one,
 * plus the previous one while its rotation grace period is still running,
 * so receivers that haven't switched yet keep verifying.
 * @param {{ secret: string, previousSecret?: string | null, previousSecretExpiresAt?: Date | null }} webhook
 * @param {Date} [now]
 * @returns {string[]}
 */
export function activeSigningSecrets(webhook, now = new Date()) {
  const secrets = [decryptWebhookSecret(webhook.secret)];
  const previousStillValid =
    webhook.previousSecret && webhook.previousSecretExpiresAt && webhook.previousSecretExpiresAt > now;
  if (previousStillValid) secrets.push(decryptWebhookSecret(webhook.previousSecret));
  return secrets.filter(Boolean);
}

export default {
  generateWebhookSecret,
  encryptWebhookSecret,
  decryptWebhookSecret,
  isEncryptedWebhookSecret,
  activeSigningSecrets,
};
