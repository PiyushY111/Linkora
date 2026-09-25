import mongoose from 'mongoose';
import Organization from '../models/Organization.js';
import Workspace from '../models/Workspace.js';
import { getClientIp } from '../utils/helpers.js';
import { isIpAllowed } from '../utils/ipAllowlist.js';
import { ROLE_RANK, hasPermission, isFixedRole, permissionDeniedMessage } from '../utils/permissions.js';
import { NotFoundError, ForbiddenError, IpNotAllowedError } from '../lib/errors.js';

/**
 * The user's highest built-in role across the org's workspaces, 'custom' if
 * they only hold custom roles there, or null if they aren't a member.
 * Org-level actions (SSO, IP allowlist) are owner-only, which no custom
 * role can hold.
 */
export async function organizationRoleOf(organizationId, userId) {
  const workspaces = await Workspace.find({ organization: organizationId, 'members.user': userId }).lean();
  const roles = workspaces.flatMap((w) => w.members.filter((m) => String(m.user) === String(userId)).map((m) => m.role));
  if (roles.length === 0) return null;
  const fixed = roles.filter(isFixedRole).sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
  return fixed[0] ?? 'custom';
}

/**
 * Throws IpNotAllowedError unless the request's IP passes the org's
 * allowlist (an empty list passes everything). Cached per request, since a
 * request may check the same org more than once.
 */
export async function assertOrganizationIpAllowed(req, organizationId) {
  const key = String(organizationId);
  req.orgIpChecks ??= new Map();
  if (!req.orgIpChecks.has(key)) {
    const org = await Organization.findById(organizationId).select('ipAllowlist').lean();
    req.orgIpChecks.set(key, isIpAllowed(getClientIp(req), org?.ipAllowlist));
  }
  if (!req.orgIpChecks.get(key)) throw new IpNotAllowedError(getClientIp(req));
}

/**
 * Loads an org for an org-level action by the signed-in user: 404 if it
 * doesn't exist or they aren't a member (indistinguishable), the org's IP
 * allowlist, then the role check for `action`.
 * @returns {Promise<import('mongoose').Document>}
 */
export async function loadOrganizationFor(req, organizationId, action) {
  if (!mongoose.isValidObjectId(organizationId)) throw new NotFoundError('Organization not found');
  const org = await Organization.findById(organizationId);
  if (!org) throw new NotFoundError('Organization not found');

  const role = await organizationRoleOf(org._id, req.user._id);
  if (!role) throw new NotFoundError('Organization not found');
  await assertOrganizationIpAllowed(req, org._id);
  if (!hasPermission(role, action)) throw new ForbiddenError(permissionDeniedMessage(action));
  return org;
}

export default { organizationRoleOf, assertOrganizationIpAllowed, loadOrganizationFor };
