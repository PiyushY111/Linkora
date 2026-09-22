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

  logout: async () => {
    const response = await api.post('/auth/logout');
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
