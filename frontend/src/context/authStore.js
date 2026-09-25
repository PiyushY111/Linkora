import { create } from 'zustand';
// Only used inside actions, never at module load, so the authStore <-> api
// import cycle (api.js reads the token from this store) is safe.
import { authService, workspaceService } from '../services';
import { can } from '../utils/permissions';

// Clean up any legacy tokens stored in localStorage by earlier versions
try {
  localStorage.removeItem('linkora_token');
  localStorage.removeItem('linkora_user');
} catch {}

/**
 * Global authentication store.
 * The access token and user state are strictly held in-memory (Zustand state).
 * Neither is persisted to browser localStorage or sessionStorage, closing the
 * window for script-based token exfiltration (XSS).
 *
 * Session persistence across tab reloads is handled exclusively via the
 * SameSite=Strict, HttpOnly refresh cookie verified in bootstrapSession().
 *
 * activeWorkspace ({ id, name, role }) comes back on every auth response and
 * decides which workspace the server scopes links, analytics, API keys and
 * webhooks to. It and the workspace list are in-memory only as well.
 */
const useAuthStore = create((set) => ({
  user: null,
  token: null,
  activeWorkspace: null,
  workspaces: [],
  // Custom role id -> name for the roles in `workspaces` (built-in roles
  // aren't listed); see utils/roles.js roleLabel.
  workspaceRoleNames: {},
  isLoading: false,
  isBootstrapping: true,
  error: null,

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setLoading: (isLoading) => set({ isLoading }),
  setBootstrapped: () => set({ isBootstrapping: false }),
  setError: (error) => set({ error }),

  // Re-reads every workspace the user belongs to. Failures are left to the
  // caller; the existing list is kept.
  refreshWorkspaces: async () => {
    const data = await workspaceService.listWorkspaces();
    set({ workspaces: data.workspaces || [], workspaceRoleNames: data.roleNames || {} });
    return data.workspaces;
  },

  // Throws on failure (e.g. no longer a member) so the caller can toast it;
  // the store only changes once the server has accepted the switch.
  switchActiveWorkspace: async (workspaceId) => {
    const data = await authService.switchActiveWorkspace(workspaceId);
    // data.user is only { id, name, email }; keep the fuller profile we hold.
    set({ activeWorkspace: data.activeWorkspace });
    return data.activeWorkspace;
  },

  logout: () => {
    try {
      localStorage.removeItem('linkora_token');
      localStorage.removeItem('linkora_user');
    } catch {}
    set({ user: null, token: null, activeWorkspace: null, workspaces: [], workspaceRoleNames: {} });
  },

  clearError: () => set({ error: null }),
}));

/**
 * Whether the current role in the active workspace allows `action`
 * (see utils/permissions.js). UX only; the backend is the real gate.
 * @param {string} action
 */
export const useCan = (action) => useAuthStore((state) => can(state.activeWorkspace, action));

export default useAuthStore;
