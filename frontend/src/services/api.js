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
  timeout: 10000,
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

// Single in-flight refresh shared across any requests that 401 at the same
// time, so a burst of concurrent requests doesn't fire N refresh calls and
// race each other over the (single-use, rotating) refresh token.
let refreshPromise = null;

async function refreshAccessToken() {
  const response = await axios.post(
    `${API_BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true, timeout: 2500 }
  );
  const { token, user } = response.data;
  useAuthStore.getState().setToken(token);
  if (user) {
    useAuthStore.getState().setUser(user);
  }
  return token;
}

/**
 * Validates any existing session on app load or performs a silent refresh
 * from the httpOnly cookie so hard reloads maintain seamless authentication.
 */
export async function bootstrapSession() {
  const currentToken = useAuthStore.getState().token;

  if (currentToken) {
    try {
      const res = await api.get('/auth/me');
      if (res.data?.user) {
        useAuthStore.getState().setUser(res.data.user);
      }
      return;
    } catch (err) {
      // If error is transient (network / cold start), preserve session
      if (err.response?.status !== 401) {
        return;
      }
      // If 401, token expired: fall through to silent refresh
    } finally {
      useAuthStore.getState().setBootstrapped();
    }
  }

  try {
    await refreshAccessToken();
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

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
