import { create } from 'zustand';

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
 */
const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isLoading: false,
  isBootstrapping: true,
  error: null,

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setLoading: (isLoading) => set({ isLoading }),
  setBootstrapped: () => set({ isBootstrapping: false }),
  setError: (error) => set({ error }),

  logout: () => {
    try {
      localStorage.removeItem('linkora_token');
      localStorage.removeItem('linkora_user');
    } catch {}
    set({ user: null, token: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
