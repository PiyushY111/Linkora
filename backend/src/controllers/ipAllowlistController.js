import Workspace from '../models/Workspace.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { MAX_ALLOWLIST_ENTRIES, isIpAllowed, normalizeAllowlist } from '../utils/ipAllowlist.js';
import { ValidationError } from '../lib/errors.js';
import { loadOrganizationFor } from '../services/organizationAccess.js';

/** The allowlist block returned to owners, with the IP they're connecting from. */
export function ipAllowlistPayload(org, req) {
  return { entries: org.ipAllowlist ?? [], yourIp: getClientIp(req) };
}

/**
 * PATCH /api/workspaces/organizations/:organizationId/ip-allowlist — owner
 * only ('ipAllowlist:manage'), from an IP the current list allows. Body:
 * { ipAllowlist: string[] } replaces the whole list; [] removes the
 * restriction. A non-empty list must include the IP it's saved from, so an
 * owner can't lock themselves (and everyone) out by mistake.
 */
export const updateIpAllowlist = async (req, res) => {
  const org = await loadOrganizationFor(req, req.params.organizationId, 'ipAllowlist:manage');

  const { ipAllowlist } = req.body ?? {};
  if (!Array.isArray(ipAllowlist)) throw new ValidationError('ipAllowlist must be an array of IP addresses or CIDR ranges');
  const { valid, invalid } = normalizeAllowlist(ipAllowlist);
  if (invalid.length > 0) {
    throw new ValidationError(`Not a valid IP address or CIDR range: ${invalid.map(String).slice(0, 5).join(', ')}`);
  }
  if (valid.length > MAX_ALLOWLIST_ENTRIES) throw new ValidationError(`At most ${MAX_ALLOWLIST_ENTRIES} entries`);

  const yourIp = getClientIp(req);
  if (valid.length > 0 && !isIpAllowed(yourIp, valid)) {
    throw new ValidationError(`The list must include your current IP address (${yourIp}), or you'd be locked out`);
  }

  const before = org.ipAllowlist ?? [];
  org.ipAllowlist = valid;
  await org.save();

  const added = valid.filter((entry) => !before.includes(entry));
  const removed = before.filter((entry) => !valid.includes(entry));
  if (added.length > 0 || removed.length > 0) {
    // Org-level change: record it in each of the org's workspaces' activity.
    const workspaceIds = await Workspace.find({ organization: org._id }).distinct('_id');
    for (const workspace of workspaceIds) {
      logAudit({
        action: 'organization.ip_allowlist.update',
        workspace,
        actorUserId: req.user.id,
        targetResourceId: String(org._id),
        ipAddress: yourIp,
        diff: { added, removed, entries: valid.length },
      });
    }
  }

  res.status(200).json({ success: true, ipAllowlist: ipAllowlistPayload(org, req) });
};

export default { updateIpAllowlist, ipAllowlistPayload };
