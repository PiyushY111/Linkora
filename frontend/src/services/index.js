import api from './api';

export const authService = {
  register: async (name, email, password) => {
    const response = await api.post('/auth/register', { name, email, password });
    return response.data;
  },

  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  updateProfile: async (userData) => {
    const response = await api.put('/auth/profile', userData);
    return response.data;
  },

  generateApiKey: async () => {
    const response = await api.post('/auth/generate-api-key');
    return response.data;
  },

  logout: async (refreshToken) => {
    const response = await api.post('/auth/logout', { refreshToken });
    return response.data;
  },
};

export const linkService = {
  createLink: async (linkData) => {
    const response = await api.post('/links', linkData);
    return response.data;
  },

  getLinks: async (paramsOrPage = 1, limit = 50, sort = '-createdAt') => {
    const params = typeof paramsOrPage === 'object' && paramsOrPage !== null
      ? paramsOrPage
      : { page: paramsOrPage, limit, sort };
    const response = await api.get('/links', { params });
    return response.data;
  },

  getLink: async (id) => {
    const response = await api.get(`/links/${id}`);
    return response.data;
  },

  updateLink: async (id, linkData) => {
    const response = await api.put(`/links/${id}`, linkData);
    return response.data;
  },

  deleteLink: async (id) => {
    const response = await api.delete(`/links/${id}`);
    return response.data;
  },

  toggleLinkStatus: async (id) => {
    const response = await api.patch(`/links/${id}/toggle`);
    return response.data;
  },
};

export const analyticsService = {
  getLinkAnalytics: async (linkId, params = {}) => {
    const response = await api.get(`/analytics/link/${linkId}`, { params });
    return response.data;
  },

  getAnalyticsSummary: async (params = {}) => {
    const response = await api.get('/analytics/summary/all', { params });
    return response.data;
  },

  exportAnalytics: async (params = {}) => {
    const response = await api.get('/analytics/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};

export const workspaceService = {
  createOrganization: async (name) => {
    const response = await api.post('/workspaces/organizations', { name });
    return response.data;
  },

  listWorkspaces: async () => {
    const response = await api.get('/workspaces');
    return response.data;
  },

  getWorkspace: async (workspaceId) => {
    const response = await api.get(`/workspaces/${workspaceId}`);
    return response.data;
  },

  upsertMember: async (workspaceId, email, role) => {
    const response = await api.post(`/workspaces/${workspaceId}/members`, { email, role });
    return response.data;
  },

  removeMember: async (workspaceId, userId) => {
    const response = await api.delete(`/workspaces/${workspaceId}/members/${userId}`);
    return response.data;
  },
};

export const webhookService = {
  list: async () => {
    const response = await api.get('/webhooks');
    return response.data;
  },

  get: async (id) => {
    const response = await api.get(`/webhooks/${id}`);
    return response.data;
  },

  create: async (dataOrUrl, events, description) => {
    const payload =
      typeof dataOrUrl === 'object'
        ? dataOrUrl
        : { url: dataOrUrl, events, description };
    const response = await api.post('/webhooks', payload);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/webhooks/${id}`, data);
    return response.data;
  },

  remove: async (id) => {
    const response = await api.delete(`/webhooks/${id}`);
    return response.data;
  },

  test: async (id, event = 'endpoint.test') => {
    const response = await api.post(`/webhooks/${id}/test`, { event });
    return response.data;
  },

  rotateSecret: async (id) => {
    const response = await api.post(`/webhooks/${id}/rotate-secret`);
    return response.data;
  },

  listDeliveries: async (id, params = {}) => {
    const response = await api.get(`/webhooks/${id}/deliveries`, { params });
    return response.data;
  },

  retryDelivery: async (id, deliveryId) => {
    const response = await api.post(`/webhooks/${id}/deliveries/${deliveryId}/retry`);
    return response.data;
  },
};

export const developerService = {
  listKeys: async () => {
    const response = await api.get('/developer/keys');
    return response.data;
  },

  createKey: async (data) => {
    const response = await api.post('/developer/keys', data);
    return response.data;
  },

  updateKey: async (id, data) => {
    const response = await api.patch(`/developer/keys/${id}`, data);
    return response.data;
  },

  rollKey: async (id) => {
    const response = await api.post(`/developer/keys/${id}/roll`);
    return response.data;
  },

  revokeKey: async (id) => {
    const response = await api.delete(`/developer/keys/${id}`);
    return response.data;
  },

  getMetrics: async () => {
    const response = await api.get('/developer/metrics');
    return response.data;
  },

  listLogs: async (params = {}) => {
    const response = await api.get('/developer/logs', { params });
    return response.data;
  },

  getOpenApiSpec: async () => {
    const response = await api.get('/public/v1/openapi.json');
    return response.data;
  },
};

export const publicApiService = {
  /**
   * Universal runner for the Developer Playground.
   * Executes requests with the user's active API key and measures client-side latency.
   */
  executeRequest: async (apiKey, method, endpoint, payload = null, params = {}) => {
    const start = Date.now();
    try {
      const response = await api({
        method,
        url: `/public/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`,
        data: payload,
        params,
        headers: { 'x-api-key': apiKey },
      });

      return {
        status: response.status,
        statusText: response.statusText,
        latencyMs: Date.now() - start,
        headers: response.headers,
        data: response.data,
      };
    } catch (error) {
      return {
        status: error.response?.status || 500,
        statusText: error.response?.statusText || 'Error',
        latencyMs: Date.now() - start,
        headers: error.response?.headers || {},
        data: error.response?.data || { success: false, message: error.message },
      };
    }
  },

  listLinks: async (apiKey, params = {}) => {
    const response = await api.get('/public/v1/links', {
      params,
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  },

  createLink: async (apiKey, linkData) => {
    const response = await api.post('/public/v1/links', linkData, {
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  },

  getLink: async (apiKey, code) => {
    const response = await api.get(`/public/v1/links/${code}`, {
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  },

  updateLink: async (apiKey, code, linkData) => {
    const response = await api.patch(`/public/v1/links/${code}`, linkData, {
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  },

  deleteLink: async (apiKey, code) => {
    const response = await api.delete(`/public/v1/links/${code}`, {
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  },

  getLinkAnalytics: async (apiKey, code) => {
    const response = await api.get(`/public/v1/links/${code}/analytics`, {
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  },

  bulkCreateLinks: async (apiKey, links) => {
    const response = await api.post(
      '/public/v1/links/bulk',
      { links },
      { headers: { 'x-api-key': apiKey } }
    );
    return response.data;
  },

  getUsage: async (apiKey) => {
    const response = await api.get('/public/v1/usage', {
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  },

  getOpenApiSpec: async () => {
    const response = await api.get('/public/v1/openapi.json');
    return response.data;
  },
};

