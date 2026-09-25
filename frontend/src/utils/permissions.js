/**
 * Whether the active workspace role allows `action`. The list comes from the
 * server (activeWorkspace.permissions, built from backend/src/utils/
 * permissions.js), so the matrix isn't duplicated here.
 *
 * UX only: this hides controls a role can't use. The backend enforces every
 * one of these checks on its own.
 * @param {{ permissions?: string[] } | null | undefined} activeWorkspace
 * @param {string} action - e.g. 'links:write', 'analytics:export'
 */
export function can(activeWorkspace, action) {
  return Boolean(activeWorkspace?.permissions?.includes(action));
}

export default can;
