import AuditLog from '../models/AuditLog.js';
import { logger } from '../config/logger.js';

/**
 * Fire-and-forget audit log write — never blocks or fails the request that
 * triggered it.
 * Pass `workspace` for anything that happens inside a workspace so it shows
 * up in that workspace's activity feed. Never put secrets in `diff`.
 * @param {{ action: string, actorUserId?: string, workspace?: unknown, targetResourceId?: string, ipAddress?: string, diff?: unknown }} entry
 */
export function logAudit(entry) {
  AuditLog.create(entry).catch((err) => logger.error({ err, action: entry.action }, 'Failed to write audit log'));
}

/**
 * A URL reduced to its origin for audit diffs. Webhook endpoints (Slack,
 * Discord, ...) often carry their credential in the path or query, and the
 * audit log is shown to workspace admins.
 * @param {string | undefined} url
 */
export function auditSafeUrl(url) {
  if (!url) return url;
  try {
    return new URL(url).origin;
  } catch {
    return '[invalid url]';
  }
}

export default logAudit;
