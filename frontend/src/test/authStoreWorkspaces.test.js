import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services', () => ({
  authService: { switchActiveWorkspace: vi.fn() },
  workspaceService: { listWorkspaces: vi.fn() },
}));

const { authService, workspaceService } = await import('../services');
const { default: useAuthStore } = await import('../context/authStore.js');

const PERSONAL = { id: 'ws-personal', name: 'Personal', role: 'owner' };
const TEAM = { id: 'ws-team', name: 'Team', role: 'creator' };

describe('authStore workspace state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'u1', name: 'Ada', email: 'ada@example.com', bio: 'kept' },
      token: 'token',
      activeWorkspace: PERSONAL,
      workspaces: [],
    });
  });

  it('switchActiveWorkspace stores the server-confirmed workspace and keeps the full user', async () => {
    authService.switchActiveWorkspace.mockResolvedValue({
      success: true,
      user: { id: 'u1', name: 'Ada', email: 'ada@example.com' },
      activeWorkspace: TEAM,
    });

    await useAuthStore.getState().switchActiveWorkspace('ws-team');

    expect(authService.switchActiveWorkspace).toHaveBeenCalledWith('ws-team');
    expect(useAuthStore.getState().activeWorkspace).toEqual(TEAM);
    expect(useAuthStore.getState().user.bio).toBe('kept');
  });

  it('leaves the active workspace unchanged when the switch is rejected', async () => {
    authService.switchActiveWorkspace.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } })
    );

    await expect(useAuthStore.getState().switchActiveWorkspace('ws-team')).rejects.toThrow('Forbidden');
    expect(useAuthStore.getState().activeWorkspace).toEqual(PERSONAL);
  });

  it('refreshWorkspaces stores the list from the server', async () => {
    const list = [{ _id: 'ws-personal', name: 'Personal' }, { _id: 'ws-team', name: 'Team' }];
    workspaceService.listWorkspaces.mockResolvedValue({ success: true, workspaces: list });

    await useAuthStore.getState().refreshWorkspaces();

    expect(useAuthStore.getState().workspaces).toEqual(list);
  });

  it('logout clears the active workspace and the list', () => {
    useAuthStore.setState({ workspaces: [{ _id: 'ws-team' }] });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().activeWorkspace).toBeNull();
    expect(useAuthStore.getState().workspaces).toEqual([]);
  });
});
