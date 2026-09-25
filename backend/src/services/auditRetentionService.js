import cron from 'node-cron';
import AuditLog from '../models/AuditLog.js';
import Organization from '../models/Organization.js';
import Workspace from '../models/Workspace.js';
import { logger } from '../config/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The shortest retention an org may set: a shortening stays on record this long. */
export const MIN_AUDIT_RETENTION_DAYS = 30;
/** Default for new orgs, and for account-level entries (logins, profile changes) that belong to no workspace. */
export const DEFAULT_AUDIT_RETENTION_DAYS = 365;
/** Technical ceiling (~2,700 years); anything this large is effectively forever. */
export const MAX_AUDIT_RETENTION_DAYS = 1_000_000;

const cutoff = (days, now) => new Date(now.getTime() - days * DAY_MS);

/**
 * Deletes audit entries past their retention: each organization's
 * workspace entries after its auditRetentionDays (null = keep forever), and
 * account-level entries after DEFAULT_AUDIT_RETENTION_DAYS. There's no Mongo
 * TTL index because retention differs per org. Idempotent, so overlapping
 * runs on several instances are harmless.
 * @param {Date} [now]
 * @returns {Promise<{ organizations: number, deleted: number }>}
 */
export async function purgeExpiredAuditLogs(now = new Date()) {
  let organizations = 0;
  let deleted = 0;

  const orgs = Organization.find({ auditRetentionDays: { $ne: null } }).select('auditRetentionDays').lean().cursor();
  for await (const org of orgs) {
    // Enforce the floor here too, in case a value was edited in the database.
    const days = Math.max(org.auditRetentionDays, MIN_AUDIT_RETENTION_DAYS);
    const workspaceIds = await Workspace.find({ organization: org._id }).distinct('_id');
    if (workspaceIds.length === 0) continue;
    const result = await AuditLog.deleteMany({ workspace: { $in: workspaceIds }, timestamp: { $lt: cutoff(days, now) } });
    organizations += 1;
    deleted += result.deletedCount;
  }

  const accountLevel = await AuditLog.deleteMany({
    workspace: null,
    timestamp: { $lt: cutoff(DEFAULT_AUDIT_RETENTION_DAYS, now) },
  });
  deleted += accountLevel.deletedCount;

  if (deleted > 0) logger.info({ organizations, deleted }, 'Purged audit log entries past retention');
  return { organizations, deleted };
}

/** Nightly at 03:30 server time. @returns {import('node-cron').ScheduledTask} */
export function scheduleAuditRetention() {
  return cron.schedule('30 3 * * *', () => {
    purgeExpiredAuditLogs().catch((err) => logger.error({ err }, 'Scheduled audit log retention cleanup failed'));
  });
}

export default {
  MIN_AUDIT_RETENTION_DAYS,
  DEFAULT_AUDIT_RETENTION_DAYS,
  MAX_AUDIT_RETENTION_DAYS,
  purgeExpiredAuditLogs,
  scheduleAuditRetention,
};
