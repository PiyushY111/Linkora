#!/usr/bin/env node
/**
 * One-off migration: moves legacy API keys, stored in plaintext on
 * User.apiKey by the removed POST /api/auth/generate-api-key, into the
 * ApiKey collection as SHA-256 hashes with full ('*') scope, then unsets the
 * plaintext. Existing integrations keep working: the same raw key now
 * authenticates through the hashed lookup in middleware/apiKeyAuth.js.
 *
 * Safe to re-run, and safe to resume after a crash: the ApiKey is created
 * first (keyHash is unique, so a second attempt finds it instead of
 * duplicating it), and the plaintext is unset only after that.
 *
 * Usage: node scripts/migrate-legacy-api-keys.js
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import User from '../src/models/User.js';
import ApiKey from '../src/models/ApiKey.js';
import { getRedis } from '../src/services/cacheService.js';

const DUPLICATE_KEY = 11000;

async function ensureHashedKey(userId, rawKey) {
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  if (await ApiKey.exists({ keyHash })) return false;

  const prefix = rawKey.slice(0, 12);
  const lastFour = rawKey.slice(-4);
  try {
    await ApiKey.create({
      user: userId,
      name: 'Legacy key (migrated)',
      keyHash,
      prefix,
      maskedKey: `${prefix}...${lastFour}`,
      lastFour,
      environment: 'live',
      scopes: ['*'],
    });
    return true;
  } catch (err) {
    if (err?.code === DUPLICATE_KEY) return false;
    throw err;
  }
}

/**
 * Runs against whatever Mongo connection is already open, so tests can call
 * it directly.
 * @returns {Promise<{ scanned: number, migrated: number }>}
 */
export async function migrateLegacyApiKeys() {
  // The raw collection, not the model: User.apiKey is select:false.
  const cursor = User.collection.find(
    { apiKey: { $exists: true, $type: 'string', $ne: '' } },
    { projection: { apiKey: 1 } }
  );

  let scanned = 0;
  let migrated = 0;

  for await (const { _id: userId, apiKey } of cursor) {
    scanned += 1;
    if (await ensureHashedKey(userId, apiKey)) migrated += 1;
    await User.collection.updateOne({ _id: userId, apiKey }, { $unset: { apiKey: '' } });
    logger.info({ userId }, 'Migrated legacy plaintext API key to a hashed ApiKey');
  }

  logger.info({ scanned, migrated }, 'Legacy API key migration complete');
  return { scanned, migrated };
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  mongoose
    .connect(env.MONGODB_URI)
    .then(() => migrateLegacyApiKeys())
    .catch((err) => {
      logger.error({ err }, 'Legacy API key migration failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await getRedis().quit().catch(() => {});
      await mongoose.connection.close().catch(() => {});
    });
}
