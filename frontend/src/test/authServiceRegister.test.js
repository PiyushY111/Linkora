import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/api', () => ({ default: { post: vi.fn() } }));

const { default: api } = await import('../services/api');
const { authService } = await import('../services/index.js');

describe('authService.register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: { success: true } });
  });

  it('defaults to a personal account and never sends an organization name for it', async () => {
    await authService.register({ name: 'Ada', email: 'ada@example.com', password: 'Password123', organizationName: 'Stale' });
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Password123',
      accountType: 'personal',
    });
  });

  it('sends the organization name for a team account', async () => {
    await authService.register({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Password123',
      accountType: 'organization',
      organizationName: 'Acme',
    });
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Password123',
      accountType: 'organization',
      organizationName: 'Acme',
    });
  });
});
