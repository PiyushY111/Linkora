import axios from 'axios';
import useAuthStore from '../context/authStore';

export const getApiOrigin = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '';
  return envUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
};

const API_BASE_URL = getApiOrigin() ? `${getApiOrigin()}/api` : '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 25000,
  // Send the httpOnly refresh-token cookie on same-origin requests to
  // /api/auth/*; it is never exposed to JavaScript.
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single in-flight refresh shared by everything that needs one (page-load
// bootstrap and any requests that 401 at the same time). The refresh token
// is single-use and rotates on every call, so two concurrent refreshes with
// the same cookie make one of them fail (or look like token reuse), and the
// failing one would log the user out.
let refreshPromise = null;

function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function refreshAccessToken() {
  const response = await axios.post(
    `${API_BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true, timeout: 10000 }
  );
  const { token, user, activeWorkspace } = response.data;
  useAuthStore.getState().setToken(token);
  if (user) {
    useAuthStore.getState().setUser(user);
  }
  if (activeWorkspace) {
    useAuthStore.getState().setActiveWorkspace(activeWorkspace);
  }
  return token;
}

/**
 * Loads the workspace list for the switcher without holding up the first
 * render. A failure only leaves the list empty; the switcher reloads it
 * whenever it's opened.
 */
function loadWorkspacesInBackground() {
  useAuthStore
    .getState()
    .refreshWorkspaces()
    .catch(() => {});
}

/**
 * Validates any existing session on app load or performs a silent refresh
 * from the httpOnly cookie so hard reloads maintain seamless authentication.
 *
 * Runs once per page load no matter how often it's called: React StrictMode
 * mounts App's effect twice in development, and two bootstraps racing over
 * the single-use refresh token used to log the user out on every reload.
 */
let bootstrapPromise = null;

export function bootstrapSession() {
  bootstrapPromise ??= runBootstrap();
  return bootstrapPromise;
}

async function runBootstrap() {
  const currentToken = useAuthStore.getState().token;

  try {
    if (currentToken) {
      try {
        const res = await api.get('/auth/me');
        if (res.data?.user) {
          useAuthStore.getState().setUser(res.data.user);
        }
        if (res.data?.activeWorkspace) {
          useAuthStore.getState().setActiveWorkspace(res.data.activeWorkspace);
        }
        loadWorkspacesInBackground();
        return;
      } catch (err) {
        // If error is transient (network / cold start), preserve session
        if (err.response?.status !== 401) {
          return;
        }
        // If 401, token expired: fall through to silent refresh
      }
    }

    await refreshOnce();
    loadWorkspacesInBackground();
  } catch {
    useAuthStore.getState().logout();
  } finally {
    useAuthStore.getState().setBootstrapped();
  }
}

const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => originalRequest?.url?.includes(path));

    // Auto-retry once on cold starts, gateway timeouts, or transient network timeouts for idempotent GETs
    const isGet = originalRequest?.method?.toLowerCase() === 'get';
    const isTransient =
      error.code === 'ECONNABORTED' ||
      !error.response ||
      [502, 503, 504].includes(error.response?.status);

    if (isGet && isTransient && originalRequest && !originalRequest._retryCount) {
      originalRequest._retryCount = 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return api(originalRequest);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const newToken = await refreshOnce();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        // An org that now requires SSO ends password sessions at refresh;
        // tell the user why they're back at the login page.
        const ssoRequired = refreshError.response?.data?.code === 'SSO_REQUIRED';
        window.location.href = ssoRequired ? '/login?error=sso_required' : '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
