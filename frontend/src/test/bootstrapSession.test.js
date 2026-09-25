import { describe, it, expect, vi } from 'vitest';

// A fake axios: the refresh endpoint is called through axios.post; the api
// instance only needs interceptors for api.js to load.
const post = vi.fn();
vi.mock('axios', () => {
  const instance = Object.assign(vi.fn(), {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    get: vi.fn().mockResolvedValue({ data: { workspaces: [], roleNames: {} } }),
  });
  return { default: { create: () => instance, post } };
});

const { bootstrapSession } = await import('../services/api.js');
const { default: useAuthStore } = await import('../context/authStore.js');

describe('bootstrapSession', () => {
  it('sends a single refresh even when called twice at once (React StrictMode), and stays signed in', async () => {
    let release;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ data: { token: 'fresh-token', user: { id: 'u1' }, activeWorkspace: { id: 'w1', permissions: [] } } });
        })
    );

    // StrictMode runs App's effect twice on mount in development.
    const first = bootstrapSession();
    const second = bootstrapSession();
    release();
    await Promise.all([first, second]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().token).toBe('fresh-token');
    expect(useAuthStore.getState().isBootstrapping).toBe(false);
  });
});
