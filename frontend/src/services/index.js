import api from './api';

export const authService = {
  /**
   * @param {{ name: string, email: string, password: string, accountType?: 'personal' | 'organization', organizationName?: string }} account
   *   accountType 'organization' creates a workspace for the team named organizationName.
   */
  register: async ({ name, email, password, accountType = 'personal', organizationName }) => {
    const response = await api.post('/auth/register', {
      name,
      email,
      password,
      accountType,
      ...(accountType === 'organization' ? { organizationName } : {}),
    });
    return response.data;
  },

  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  // "Sign in with SSO": the authorize URL for an organization (by slug).
  startSso: async (organizationSlug) => {
    const response = await api.get('/auth/sso/start', { params: { org: organizationSlug } });
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  // Every workspace-owned list (links, analytics, keys, webhooks) is scoped
  // server-side to the active workspace; this changes which one that is.
  switchActiveWorkspace: async (workspaceId) => {
    const response = await api.put('/auth/me/active-workspace', { workspaceId });
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

  changePassword: async (currentPassword, newPassword) => {
    const response = await api.put('/auth/password', { currentPassword, newPassword });
    return response.data;
  },

  exportAccountData: async () => {
    const response = await api.get('/auth/export-data');
    return response.data;
  },

  deleteAccount: async (password) => {
    const response = await api.delete('/auth/account', { data: { password } });
    return response.data;
  },

  logout: async () => {
    // No body needed: the refresh token is an httpOnly cookie the server
    // reads (and revokes) directly.
    const response = await api.post('/auth/logout');
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

  // Moves a link to another workspace the caller can create links in.
  transferLink: async (id, workspaceId) => {
    const response = await api.patch(`/links/${id}/transfer`, { workspaceId });
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

  // Bio page views plus each item's link clicks, over params.timeRange.
  getBioPageAnalytics: async (workspaceId, params = {}) => {
    const response = await api.get(`/workspaces/${workspaceId}/bio-page/analytics`, { params });
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
  createOrganization: async (name, workspaceName) => {
    const response = await api.post('/workspaces/organizations', { name, workspaceName });
    return response.data;
  },

  createPersonalWorkspace: async () => {
    const response = await api.post('/workspaces/organizations', { name: 'Personal', workspaceName: 'Personal' });
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

  // Creates (or, for an email already invited, resends) an invite. The
  // response carries the one-time inviteUrl; it can't be fetched again later.
  createInvite: async (workspaceId, email, role) => {
    const response = await api.post(`/workspaces/${workspaceId}/invites`, { email, role });
    return response.data;
  },

  revokeInvite: async (workspaceId, inviteId) => {
    const response = await api.delete(`/workspaces/${workspaceId}/invites/${inviteId}`);
    return response.data;
  },

  // Public: works without a session, for the invite landing page.
  getInvite: async (token) => {
    const response = await api.get(`/workspaces/invites/${token}`);
    return response.data;
  },

  acceptInvite: async (token) => {
    const response = await api.post(`/workspaces/invites/${token}/accept`);
    return response.data;
  },

  // Custom roles of the workspace's organization. Listing works for any
  // member (and returns the permission keys + descriptions for the editor);
  // changes need roles:manage.
  listRoles: async (workspaceId) => {
    const response = await api.get(`/workspaces/${workspaceId}/roles`);
    return response.data;
  },

  createRole: async (workspaceId, role) => {
    const response = await api.post(`/workspaces/${workspaceId}/roles`, role);
    return response.data;
  },

  updateRole: async (workspaceId, roleId, changes) => {
    const response = await api.patch(`/workspaces/${workspaceId}/roles/${roleId}`, changes);
    return response.data;
  },

  deleteRole: async (workspaceId, roleId) => {
    const response = await api.delete(`/workspaces/${workspaceId}/roles/${roleId}`);
    return response.data;
  },

  // Only the keys passed change; null clears a default.
  updateSettings: async (workspaceId, settings) => {
    const response = await api.patch(`/workspaces/${workspaceId}/settings`, settings);
    return response.data;
  },

  listActivity: async (workspaceId, params = {}) => {
    const response = await api.get(`/workspaces/${workspaceId}/activity`, { params });
    return response.data;
  },

  // The whole retained audit log as CSV (admin+).
  exportActivity: async (workspaceId) => {
    const response = await api.get(`/workspaces/${workspaceId}/activity/export`, { responseType: 'blob' });
    return response.data;
  },

  // Owner only. auditRetentionDays: whole days >= 30, or null to keep forever.
  updateAuditSettings: async (organizationId, auditRetentionDays) => {
    const response = await api.patch(`/workspaces/organizations/${organizationId}/audit-settings`, { auditRetentionDays });
    return response.data;
  },

  // Owner only. { ssoConnectionId?, ssoEnforced? }; enforcing needs an SSO
  // session through that connection.
  updateSsoSettings: async (organizationId, settings) => {
    const response = await api.patch(`/workspaces/organizations/${organizationId}/sso-settings`, settings);
    return response.data;
  },

  // Owner only, from an allowed IP. Replaces the whole list; [] = no
  // restriction. A non-empty list must include the IP you save from.
  updateIpAllowlist: async (organizationId, ipAllowlist) => {
    const response = await api.patch(`/workspaces/organizations/${organizationId}/ip-allowlist`, { ipAllowlist });
    return response.data;
  },

  // Owner only. { enabled?, directoryId?, defaultRole?, workspaceId? }
  updateDirectorySync: async (organizationId, settings) => {
    const response = await api.patch(`/workspaces/organizations/${organizationId}/directory-sync`, settings);
    return response.data;
  },

  transferOwnership: async (workspaceId, newOwnerUserId) => {
    const response = await api.post(`/workspaces/${workspaceId}/transfer-ownership`, { newOwnerUserId });
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

  getCacheDiagnostics: async () => {
    const response = await api.get('/developer/cache/diagnostics');
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

  getUsageHistory: async (apiKey, days) => {
    const response = await api.get('/public/v1/usage/history', {
      params: { days },
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  },

  getOpenApiSpec: async () => {
    const response = await api.get('/public/v1/openapi.json');
    return response.data;
  },
};


export const bioPageService = {
  // Public: what /b/:slug renders. No auth needed.
  getPublicPage: async (slug) => {
    const response = await api.get(`/bio-pages/public/${encodeURIComponent(slug)}`);
    return response.data;
  },

  // Public: { slug, available, reason?: 'taken' | 'invalid' }
  checkSlug: async (slug, { signal } = {}) => {
    const response = await api.get('/bio-pages/slug-availability', { params: { slug }, signal });
    return response.data;
  },

  // The active workspace's page (404 until one is created).
  getPage: async () => (await api.get('/bio-pages')).data,
  createPage: async (data) => (await api.post('/bio-pages', data)).data,
  updatePage: async (data) => (await api.patch('/bio-pages', data)).data,

  // { linkId } or { destinationUrl }, plus label and optional icon.
  addItem: async (item) => (await api.post('/bio-pages/items', item)).data,
  updateItem: async (itemId, changes) => (await api.patch(`/bio-pages/items/${itemId}`, changes)).data,
  reorderItems: async (itemIds) => (await api.put('/bio-pages/items/order', { itemIds })).data,
  removeItem: async (itemId) => (await api.delete(`/bio-pages/items/${itemId}`)).data,
};
