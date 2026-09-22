import AuditLog from '../models/AuditLog.js';
import { logger } from '../config/logger.js';

/**
 * Fire-and-forget audit log write — never blocks or fails the request that
 * triggered it.
 * @param {{ action: string, actorUserId?: string, targetResourceId?: string, ipAddress?: string, diff?: unknown }} entry
 */
export function logAudit(entry) {
  AuditLog.create(entry).catch((err) => logger.error({ err, action: entry.action }, 'Failed to write audit log'));
}

export default logAudit;
