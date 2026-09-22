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

  getLinks: async (page = 1, limit = 10, sort = '-createdAt') => {
    const response = await api.get('/links', {
      params: { page, limit, sort },
    });
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
  getLinkAnalytics: async (linkId) => {
    const response = await api.get(`/r/link/${linkId}`);
    return response.data;
  },

  getAnalyticsSummary: async (startDate, endDate) => {
    const response = await api.get('/r/summary/all', {
      params: { startDate, endDate },
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

  create: async (url, events) => {
    const response = await api.post('/webhooks', { url, events });
    return response.data;
  },

  remove: async (id) => {
    const response = await api.delete(`/webhooks/${id}`);
    return response.data;
  },
};

export const publicApiService = {
  /** Exercises the public bulk-create endpoint using an X-API-Key, not the session JWT. */
  bulkCreateLinks: async (apiKey, links) => {
    const response = await api.post(
      '/public/v1/links/bulk',
      { links },
      { headers: { 'x-api-key': apiKey } }
    );
    return response.data;
  },
};
