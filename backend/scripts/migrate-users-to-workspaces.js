#!/usr/bin/env node
/**
 * One-off migration: gives every user without an activeWorkspace a personal
 * Organization + "Personal" Workspace (as owner), makes it their
 * activeWorkspace, and backfills `workspace` on the Links, ApiKeys, Webhooks,
 * CustomDomains and ApiLogs they own. Safe to re-run: users that already have an
 * activeWorkspace are skipped, and a run that died partway through reuses the
 * org/workspace it had already created instead of making a second one.
 *
 * Usage: node scripts/migrate-users-to-workspaces.js
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import User from '../src/models/User.js';
import Link from '../src/models/Link.js';
import ApiKey from '../src/models/ApiKey.js';
import ApiLog from '../src/models/ApiLog.js';
import Webhook from '../src/models/Webhook.js';
import CustomDomain from '../src/models/CustomDomain.js';
import { findOrCreatePersonalWorkspace } from '../src/services/workspaceService.js';

// ApiLog is included so the developer portal's workspace-scoped metrics
// still show a migrated user's request history.
const RESOURCE_MODELS = { Link, ApiKey, ApiLog, Webhook, CustomDomain };

/**
 * Runs the migration against whatever Mongo connection is already open.
 * Exported separately from the CLI entrypoint below so it can be exercised
 * directly in tests without also taking over that connection's lifecycle.
 * @returns {Promise<{ users: { scanned: number, migrated: number },
 *   resources: Record<string, { scanned: number, migrated: number }> }>}
 */
export async function migrateUsersToWorkspaces() {
  const users = { scanned: 0, migrated: 0 };
  const resources = Object.fromEntries(Object.keys(RESOURCE_MODELS).map((name) => [name, { scanned: 0, migrated: 0 }]));

  const cursor = User.find({ activeWorkspace: null }).select('_id name').cursor();

  for await (const user of cursor) {
    users.scanned += 1;
    const { workspace, created } = await findOrCreatePersonalWorkspace(user);

    // Backfill before setting activeWorkspace: a user only drops out of the
    // cursor's filter once everything they own has been scoped, so a crash
    // here is picked up again on the next run.
    for (const [name, Model] of Object.entries(RESOURCE_MODELS)) {
      const result = await Model.updateMany(
        { user: user._id, workspace: null },
        { $set: { workspace: workspace._id } }
      );
      resources[name].scanned += result.matchedCount;
      resources[name].migrated += result.modifiedCount;
    }

    await User.updateOne({ _id: user._id, activeWorkspace: null }, { $set: { activeWorkspace: workspace._id } });

    users.migrated += 1;
    logger.info(
      { userId: user._id, workspaceId: workspace._id, workspaceCreated: created },
      'Migrated user to personal workspace'
    );
  }

  logger.info({ users, resources }, 'User-to-workspace migration complete');
  return { users, resources };
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  mongoose
    .connect(env.MONGODB_URI)
    .then(() => migrateUsersToWorkspaces())
    .catch((err) => {
      logger.error({ err }, 'User-to-workspace migration failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.connection.close().catch(() => {});
    });
}
