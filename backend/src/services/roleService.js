import mongoose from 'mongoose';
import CustomRole from '../models/CustomRole.js';
import { CUSTOM_ROLE_PERMISSIONS, isFixedRole, permissionsForRole } from '../utils/permissions.js';

/**
 * Whether `role` names a custom role: stored as the CustomRole's id.
 * @param {unknown} role
 */
export const isCustomRoleId = (role) => typeof role === 'string' && mongoose.isValidObjectId(role) && !isFixedRole(role);

/**
 * Resolves a stored role (fixed name or custom role id) within an
 * organization. A custom role from another org, or one that no longer
 * exists, resolves to no permissions.
 * @returns {Promise<{ role: string, roleName: string, permissions: string[], isCustom: boolean } | null>}
 *   null when the value isn't a role at all (for input validation)
 */
export async function resolveRole(role, organizationId) {
  if (isFixedRole(role)) return { role, roleName: role, permissions: permissionsForRole(role), isCustom: false };
  if (!isCustomRoleId(role)) return null;

  const custom = await CustomRole.findOne({ _id: role, organization: organizationId }).lean();
  if (!custom) return null;
  return {
    role: String(custom._id),
    roleName: custom.name,
    // Filtered again at read time, in case the permission table changed.
    permissions: custom.permissions.filter((p) => CUSTOM_ROLE_PERMISSIONS.includes(p)),
    isCustom: true,
  };
}

/**
 * A membership ({ user, role }) with its resolved `permissions` and
 * display `roleName` attached. A dangling custom role gets no permissions.
 * @returns {Promise<{ user: unknown, role: string, roleName: string, permissions: string[] }>}
 */
export async function withPermissions(membership, organizationId) {
  if (!membership) return membership;
  const plain = typeof membership.toObject === 'function' ? membership.toObject() : { ...membership };
  const resolved = await resolveRole(plain.role, organizationId);
  return { ...plain, roleName: resolved?.roleName ?? 'Unknown role', permissions: resolved?.permissions ?? [] };
}

/**
 * Display names for the custom role ids among `roles` (fixed names map to
 * themselves), for member lists and role badges.
 * @param {string[]} roles
 * @returns {Promise<Record<string, string>>}
 */
export async function roleNamesFor(roles) {
  const customIds = [...new Set(roles.filter(isCustomRoleId))];
  const customs = customIds.length ? await CustomRole.find({ _id: { $in: customIds } }).select('name').lean() : [];
  return Object.fromEntries(customs.map((r) => [String(r._id), r.name]));
}

export default { isCustomRoleId, resolveRole, withPermissions, roleNamesFor };
