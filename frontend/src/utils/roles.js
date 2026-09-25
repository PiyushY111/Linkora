export const BUILT_IN_ROLES = ['owner', 'admin', 'creator', 'viewer'];

// Built-in roles an invite or role change may offer (owner is only reached
// through ownership transfer).
export const ASSIGNABLE_BUILT_IN_ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'creator', label: 'Creator' },
  { value: 'admin', label: 'Admin' },
];

/**
 * Display name for a stored role: built-in names as-is, a custom role id via
 * the `roleNames` map the API returns alongside members (id -> name).
 * @param {string | undefined} role
 * @param {Record<string, string>} [roleNames]
 */
export function roleLabel(role, roleNames = {}) {
  if (!role) return '—';
  if (BUILT_IN_ROLES.includes(role)) return role;
  return roleNames[role] ?? 'Custom role';
}

/**
 * Options for a role dropdown: the assignable built-in roles, then the
 * organization's custom roles by name.
 * @param {{ id: string, name: string }[]} customRoles
 */
export function roleOptions(customRoles = []) {
  return [
    ...ASSIGNABLE_BUILT_IN_ROLES,
    ...customRoles.map((role) => ({ value: String(role.id), label: role.name, custom: true })),
  ];
}
