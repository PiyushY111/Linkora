#!/usr/bin/env node
/**
 * One-off migration: bcrypt-hashes any Link.password values still stored as
 * plaintext, left over from before the redirect password check stopped
 * accepting anything but a bcrypt hash. Safe to re-run — already-bcrypt
 * values are left untouched.
 *
 * Usage: node scripts/migrate-plaintext-link-passwords.js
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import Link from '../src/models/Link.js';
import { redis, invalidateLinkMeta } from '../src/services/cacheService.js';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

/**
 * Runs the migration against whatever Mongo connection is already open.
 * Exported separately from the CLI entrypoint below so it can be exercised
 * directly in tests without also taking over that connection's lifecycle.
 * @returns {Promise<{ scanned: number, migrated: number }>}
 */
export async function migratePlaintextLinkPasswords() {
  const cursor = Link.find({ password: { $exists: true, $nin: [null, ''] } }).cursor();

  let scanned = 0;
  let migrated = 0;

  for await (const link of cursor) {
    scanned += 1;
    if (BCRYPT_HASH_PATTERN.test(link.password)) continue;

    const hash = await bcrypt.hash(link.password, 10);
    await Link.updateOne({ _id: link._id }, { $set: { password: hash } });
    await invalidateLinkMeta(link.shortCode);
    if (link.customAlias) await invalidateLinkMeta(link.customAlias);

    migrated += 1;
    logger.info({ linkId: link._id, shortCode: link.shortCode }, 'Migrated plaintext link password to bcrypt');
  }

  logger.info({ scanned, migrated }, 'Plaintext link-password migration complete');
  return { scanned, migrated };
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  mongoose
    .connect(env.MONGODB_URI)
    .then(() => migratePlaintextLinkPasswords())
    .catch((err) => {
      logger.error({ err }, 'Plaintext link-password migration failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await redis.quit().catch(() => {});
      await mongoose.connection.close().catch(() => {});
    });
}
