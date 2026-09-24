// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../renderWithProviders';
import Login from '../../pages/Login';
import Register from '../../pages/Register';
import useAuthStore from '../../context/authStore';
import { authService } from '../../services';

vi.mock('../../services', () => ({
  authService: { login: vi.fn(), register: vi.fn() },
}));

const apiError = (message, status = 400) => Object.assign(new Error('Request failed'), { response: { status, data: message ? { message } : {} } });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAuthStore.setState({ token: null, user: null });
});

describe('Login', () => {
  const fill = async (user) => {
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
  };

  it('uses the browser\'s built-in validation: both fields required, email typed', () => {
    renderWithProviders(<Login />, { route: '/login-page' });
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toBeRequired();
  });

  it('on success stores the session and navigates to /dashboard', async () => {
    authService.login.mockResolvedValue({ token: 'tok-1', user: { id: 'u1', name: 'Ada' } });
    const user = userEvent.setup();
    renderWithProviders(<Login />, { route: '/login-page' });

    await fill(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(authService.login).toHaveBeenCalledWith('ada@example.com', 'Secret123');
    expect(useAuthStore.getState().token).toBe('tok-1');
    expect(localStorage.getItem('linkora_token')).toBe('tok-1');
  });

  it('shows the server\'s error message and stays on the page', async () => {
    authService.login.mockRejectedValue(apiError('Invalid credentials', 401));
    const user = userEvent.setup();
    renderWithProviders(<Login />, { route: '/login-page' });

    await fill(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login-page');
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('falls back to "Login failed" when the server sends no message', async () => {
    authService.login.mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();
    renderWithProviders(<Login />, { route: '/login-page' });

    await fill(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Login failed')).toBeInTheDocument();
  });

  it('disables the button while the request is in flight', async () => {
    let resolve;
    authService.login.mockReturnValue(new Promise((r) => { resolve = r; }));
    const user = userEvent.setup();
    renderWithProviders(<Login />, { route: '/login-page' });

    await fill(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    resolve({ token: 't', user: {} });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
  });
});

describe('Register', () => {
  const fill = async (user, { confirm = 'Secret123' } = {}) => {
    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.type(screen.getByLabelText('Confirm'), confirm);
  };
  const submit = (user) => user.click(screen.getByRole('button', { name: /create|sign up|register|get started/i }));

  it('rejects mismatched passwords without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Register />, { route: '/register-page' });

    await fill(user, { confirm: 'Different1' });
    await submit(user);

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('on success stores the session and navigates to /dashboard', async () => {
    authService.register.mockResolvedValue({ token: 'tok-2', user: { id: 'u2', name: 'Ada' } });
    const user = userEvent.setup();
    renderWithProviders(<Register />, { route: '/register-page' });

    await fill(user);
    await submit(user);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(authService.register).toHaveBeenCalledWith('Ada', 'ada@example.com', 'Secret123');
    expect(useAuthStore.getState().token).toBe('tok-2');
  });

  it('shows the server\'s error message', async () => {
    authService.register.mockRejectedValue(apiError('User already exists'));
    const user = userEvent.setup();
    renderWithProviders(<Register />, { route: '/register-page' });

    await fill(user);
    await submit(user);

    expect(await screen.findByText('User already exists')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/register-page');
  });

  it('falls back to "Registration failed" when the server sends no message', async () => {
    authService.register.mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();
    renderWithProviders(<Register />, { route: '/register-page' });

    await fill(user);
    await submit(user);

    expect(await screen.findByText('Registration failed')).toBeInTheDocument();
  });
});
