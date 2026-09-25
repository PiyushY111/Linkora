import AuditLog from '../models/AuditLog.js';
import Workspace from '../models/Workspace.js';
import { logger } from '../config/logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { csvRow, filenameSlug } from '../utils/csv.js';
import { ValidationError } from '../lib/errors.js';
import { loadOrganizationFor } from '../services/organizationAccess.js';
import { MIN_AUDIT_RETENTION_DAYS, MAX_AUDIT_RETENTION_DAYS } from '../services/auditRetentionService.js';

const EXPORT_HEADER = ['Timestamp (UTC)', 'Actor', 'Actor email', 'Action', 'Target', 'Details'];

/**
 * GET /:workspaceId/activity/export ('activity:read'): the workspace's whole
 * audit log (whatever retention has kept), newest first, streamed as CSV.
 * Like the Activity tab, it leaves out actor IP addresses. Every cell is
 * formula-escaped (utils/csv.js). The export itself is audited.
 */
export const exportActivity = async (req, res) => {
  const { workspace } = req;
  const date = new Date().toISOString().slice(0, 10);
  const filename = `linkora-activity-${filenameSlug(workspace.name)}-${date}.csv`;

  logAudit({
    action: 'workspace.activity.export',
    workspace: workspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write(csvRow(EXPORT_HEADER));

  const entries = AuditLog.find({ workspace: workspace._id })
    .sort({ timestamp: -1, _id: -1 })
    .populate('actorUserId', 'name email')
    .lean()
    .cursor();

  try {
    for await (const entry of entries) {
      res.write(
        csvRow([
          entry.timestamp,
          entry.actorUserId?.name ?? (entry.actorUserId ? '' : 'Deleted user'),
          entry.actorUserId?.email ?? '',
          entry.action,
          entry.targetResourceId ?? '',
          entry.diff == null ? '' : JSON.stringify(entry.diff),
        ])
      );
    }
  } catch (err) {
    // Headers are already sent, so the error handler can't send a status;
    // log it and cut the response short rather than end it as if complete.
    logger.error({ err, workspaceId: String(workspace._id) }, 'Activity export failed mid-stream');
    res.destroy(err);
    return;
  }
  res.end();
};

/** The audit settings block returned to owners. */
export function auditSettingsPayload(org) {
  return {
    auditRetentionDays: org.auditRetentionDays ?? null,
    minRetentionDays: MIN_AUDIT_RETENTION_DAYS,
  };
}

/**
 * PATCH /api/workspaces/organizations/:organizationId/audit-settings —
 * owner only ('auditSettings:manage'), from an allowed IP. Body:
 * { auditRetentionDays }: a whole number of days, at least
 * MIN_AUDIT_RETENTION_DAYS and with no plan-based cap, or null (or 0) to
 * keep entries forever. Shortening takes effect at the next nightly cleanup.
 */
export const updateAuditSettings = async (req, res) => {
  const org = await loadOrganizationFor(req, req.params.organizationId, 'auditSettings:manage');

  const { auditRetentionDays } = req.body ?? {};
  let days;
  if (auditRetentionDays === null || auditRetentionDays === 0) {
    days = null; // keep forever
  } else if (Number.isInteger(auditRetentionDays) && auditRetentionDays >= MIN_AUDIT_RETENTION_DAYS) {
    days = Math.min(auditRetentionDays, MAX_AUDIT_RETENTION_DAYS);
  } else {
    throw new ValidationError(
      `auditRetentionDays must be a whole number of days, at least ${MIN_AUDIT_RETENTION_DAYS}, or null to keep entries forever`
    );
  }

  const before = org.auditRetentionDays ?? null;
  org.auditRetentionDays = days;
  await org.save();

  if (before !== days) {
    // Org-level change: record it in each of the org's workspaces' activity.
    const workspaceIds = await Workspace.find({ organization: org._id }).distinct('_id');
    for (const workspace of workspaceIds) {
      logAudit({
        action: 'organization.audit_settings.update',
        workspace,
        actorUserId: req.user.id,
        targetResourceId: String(org._id),
        ipAddress: getClientIp(req),
        diff: { auditRetentionDays: { before, after: days } },
      });
    }
  }

  res.status(200).json({ success: true, audit: auditSettingsPayload(org) });
};

export default { exportActivity, updateAuditSettings, auditSettingsPayload };
