/**
 * The workspace permission matrix: every action that depends on a member's
 * role, and the lowest role allowed to perform it. This table is the only
 * place the matrix is defined. Route middleware (rbac.js), controllers and,
 * through the activeWorkspace payload's `permissions` list, the frontend all
 * read from it.
 *
 * Fixed roles are ordered viewer < creator < admin < owner; a role has
 * every permission of the roles below it. Organizations can also define
 * custom roles (models/CustomRole.js): any subset of the non-owner
 * permissions below. A member's role, fixed or custom, is resolved to a
 * permission list once per request (services/roleService.js) and checks
 * read that list via membershipCan().
 */
export const ROLE_RANK = Object.freeze({ viewer: 0, creator: 1, admin: 2, owner: 3 });
export const FIXED_ROLES = Object.freeze(Object.keys(ROLE_RANK));

export const PERMISSIONS = Object.freeze({
  // Links and QR codes (a QR code is saved on its link)
  'links:read': 'viewer',
  'links:write': 'creator', // create, edit, enable/disable, delete, generate QR

  // Analytics
  'analytics:read': 'viewer', // aggregates: totals, top countries/devices/referrers, time series
  'analytics:detail': 'creator', // per-click events: IP, city/country, UA, referrer
  'analytics:export': 'creator', // raw click CSV

  // Workspace integrations. Reads are admin-only too: webhook URLs can be
  // secrets themselves, delivery payloads carry visitor IPs, and API
  // request logs carry caller IPs.
  'apiKeys:manage': 'admin', // keys, their request logs and metrics
  'webhooks:manage': 'admin', // endpoints, deliveries, test pings, secrets
  'domains:manage': 'admin', // custom domains (no endpoints yet)

  // People and workspace administration
  'members:manage': 'admin', // invite, revoke invites, remove, change roles below owner
  'roles:manage': 'admin', // create, edit and delete the organization's custom roles
  'settings:manage': 'admin', // workspace defaults: domain, QR style, UTM params
  'activity:read': 'admin', // the workspace audit log (who changed what)

  // Owner-only
  'ownership:transfer': 'owner', // grant the owner role, or change/remove an owner
  'sso:manage': 'owner', // organization SSO connection and enforcement
  'ipAllowlist:manage': 'owner', // organization IP allowlist
  'auditSettings:manage': 'owner', // how long the organization keeps its audit log
  'directorySync:manage': 'owner', // SCIM provisioning from the org's identity provider
  'workspace:delete': 'owner', // no endpoint yet
  'organization:delete': 'owner', // no endpoint yet
  'billing:manage': 'owner', // no billing in this repo yet
});

/** What each permission allows, for the custom-role editor. Same keys as PERMISSIONS. */
export const PERMISSION_DESCRIPTIONS = Object.freeze({
  'links:read': 'View links and QR codes',
  'links:write': 'Create, edit, pause and delete links and QR codes',
  'analytics:read': 'View analytics totals and charts',
  'analytics:detail': 'See individual clicks (IP, location, device)',
  'analytics:export': 'Export raw click data as CSV',
  'apiKeys:manage': 'Manage API keys and view API request logs',
  'webhooks:manage': 'Manage webhooks and view deliveries',
  'domains:manage': 'Manage custom domains',
  'members:manage': 'Invite, remove and change the roles of members',
  'roles:manage': 'Create, edit and delete custom roles',
  'settings:manage': 'Change workspace defaults (UTM, QR style, domain)',
  'activity:read': 'View the workspace activity log',
  'ownership:transfer': 'Transfer ownership; grant or change the owner role',
  'sso:manage': 'Configure and enforce single sign-on',
  'ipAllowlist:manage': 'Manage the IP allowlist',
  'auditSettings:manage': 'Set how long the audit log is kept',
  'directorySync:manage': 'Configure automatic provisioning (SCIM)',
  'workspace:delete': 'Delete the workspace',
  'organization:delete': 'Delete the organization',
  'billing:manage': 'Manage billing',
});

/**
 * Permissions a custom role may include: everything below owner. Owner-only
 * actions stay with the fixed owner role, so ownership can't be minted.
 */
export const CUSTOM_ROLE_PERMISSIONS = Object.freeze(
  Object.keys(PERMISSIONS).filter((action) => PERMISSIONS[action] !== 'owner')
);

export const isFixedRole = (role) => typeof role === 'string' && Object.hasOwn(ROLE_RANK, role);

/**
 * @param {string} action - a key of PERMISSIONS
 * @returns {'viewer' | 'creator' | 'admin' | 'owner'}
 */
export function requiredRole(action) {
  const role = PERMISSIONS[action];
  // An unknown action is a typo in our code, not a user error: fail loudly
  // rather than silently allowing or denying.
  if (!role) throw new Error(`Unknown permission action: ${action}`);
  return role;
}

/**
 * @param {string | undefined} role - the member's workspace role
 * @param {string} action - a key of PERMISSIONS
 */
export function hasPermission(role, action) {
  const needed = requiredRole(action);
  return isFixedRole(role) && ROLE_RANK[role] >= ROLE_RANK[needed];
}

/**
 * Whether a resolved membership (one carrying `permissions`, see
 * roleService.withPermissions) allows `action`. Works for fixed and custom
 * roles alike; this is what request-time checks use.
 * @param {{ permissions?: string[] } | null | undefined} membership
 * @param {string} action - a key of PERMISSIONS
 */
export function membershipCan(membership, action) {
  requiredRole(action); // unknown action: throw, as above
  return Boolean(membership?.permissions?.includes(action));
}

/**
 * The grant rule: nobody can hand out (via a role they create, edit or
 * assign) or take away (by changing or removing a member) permissions they
 * don't hold themselves.
 * @param {string[]} held - the acting member's permissions
 * @param {string[]} other - the permissions being granted or touched
 */
export function holdsAll(held, other) {
  return other.every((action) => held.includes(action));
}

/** The 403 message for a denied action, same wording everywhere. */
export function permissionDeniedMessage(action) {
  return `Requires ${requiredRole(action)} role or higher`;
}

/**
 * Every action the role may perform. Sent to the frontend so it can hide
 * controls without keeping its own copy of the matrix.
 * @param {string | undefined} role
 * @returns {string[]}
 */
export function permissionsForRole(role) {
  return Object.keys(PERMISSIONS).filter((action) => hasPermission(role, action));
}

export default {
  ROLE_RANK,
  FIXED_ROLES,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  CUSTOM_ROLE_PERMISSIONS,
  isFixedRole,
  requiredRole,
  hasPermission,
  membershipCan,
  holdsAll,
  permissionDeniedMessage,
  permissionsForRole,
};
