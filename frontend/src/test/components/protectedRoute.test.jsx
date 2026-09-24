// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders';
import ProtectedRoute from '../../components/ProtectedRoute';
import useAuthStore from '../../context/authStore';
import { authService } from '../../services';

vi.mock('../../services', () => ({
  authService: { getCurrentUser: vi.fn() },
}));

const Secret = () => <div>secret page</div>;
const renderGuard = () => renderWithProviders(<ProtectedRoute component={Secret} />, { route: '/private' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('ProtectedRoute', () => {
  it('shows a spinner, not the page and not a redirect, while the session is bootstrapping', () => {
    useAuthStore.setState({ token: null, user: null, isBootstrapping: true });
    renderGuard();
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/private');
  });

  it('redirects to /login when there is no token', () => {
    useAuthStore.setState({ token: null, user: null, isBootstrapping: false });
    renderGuard();
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('renders the page with a token and a user, without refetching the user', () => {
    useAuthStore.setState({ token: 'tok', user: { id: 'u1' }, isBootstrapping: false });
    renderGuard();
    expect(screen.getByText('secret page')).toBeInTheDocument();
    expect(authService.getCurrentUser).not.toHaveBeenCalled();
  });

  it('with a token but no user, renders the page and loads the user', async () => {
    authService.getCurrentUser.mockResolvedValue({ user: { id: 'u1', name: 'Ada' } });
    useAuthStore.setState({ token: 'tok', user: null, isBootstrapping: false });
    renderGuard();
    expect(screen.getByText('secret page')).toBeInTheDocument();
    await waitFor(() => expect(useAuthStore.getState().user).toEqual({ id: 'u1', name: 'Ada' }));
  });

  it('keeps rendering the page if loading the user fails', async () => {
    authService.getCurrentUser.mockRejectedValue(new Error('offline'));
    useAuthStore.setState({ token: 'tok', user: null, isBootstrapping: false });
    renderGuard();
    await waitFor(() => expect(authService.getCurrentUser).toHaveBeenCalled());
    expect(screen.getByText('secret page')).toBeInTheDocument();
  });
});
