import { create } from 'zustand';

const TOKEN_KEY = 'linkora_token';
const USER_KEY = 'linkora_user';

const getStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const initialToken = getStoredToken();
const initialUser = getStoredUser();

const useAuthStore = create((set) => ({
  user: initialUser,
  token: initialToken,
  isLoading: false,
  // If we already have a persisted token, we don't need a full-screen block,
  // but bootstrapSession() will silently re-validate in the background.
  isBootstrapping: !initialToken,
  error: null,

  setUser: (user) => {
    try {
      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(USER_KEY);
      }
    } catch {}
    set({ user });
  },

  setToken: (token) => {
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {}
    set({ token });
  },

  setLoading: (isLoading) => set({ isLoading }),
  setBootstrapped: () => set({ isBootstrapping: false }),
  setError: (error) => set({ error }),

  logout: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
    set({ user: null, token: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
