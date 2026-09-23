import { create } from 'zustand';

// The access token lives in memory only (never localStorage/sessionStorage)
// so it isn't readable by an XSS payload that persists across reloads. The
// refresh token never reaches JavaScript at all — it's an httpOnly cookie
// set by the server. Losing the in-memory token on a hard refresh is
// expected and handled by bootstrapSession() (see services/api.js), which
// exchanges the refresh cookie for a fresh access token on app load.
const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isLoading: false,
  // True until the initial silent-refresh attempt (via the refresh cookie)
  // has resolved, so routing decisions never fire on a stale/absent token.
  isBootstrapping: true,
  error: null,

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),

  setLoading: (isLoading) => set({ isLoading }),
  setBootstrapped: () => set({ isBootstrapping: false }),
  setError: (error) => set({ error }),

  logout: () => {
    set({ user: null, token: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
