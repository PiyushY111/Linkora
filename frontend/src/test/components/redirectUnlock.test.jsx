// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { renderWithProviders } from '../renderWithProviders';
import Redirect from '../../pages/Redirect';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../services/api', () => ({ getApiOrigin: () => '' }));

const apiError = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

// The page navigates by assigning window.location.href; record it instead.
let location;
const realLocation = window.location;
beforeEach(() => {
  vi.clearAllMocks();
  location = { href: 'http://localhost/abc123', search: '' };
  Object.defineProperty(window, 'location', { value: location, configurable: true, writable: true });
});
afterEach(() => {
  Object.defineProperty(window, 'location', { value: realLocation, configurable: true, writable: true });
});

const renderRedirect = () => renderWithProviders(<Redirect />, { route: '/abc123', path: '/:shortCode' });

async function openPasswordPrompt() {
  axios.get.mockRejectedValue(apiError(403, { requiresPassword: true }));
  renderRedirect();
  return screen.findByLabelText('Link Password');
}

describe('Redirect page', () => {
  it('sends an unprotected link straight to the backend redirect', async () => {
    axios.get.mockResolvedValue({ data: { success: true, originalUrl: 'https://example.com' } });
    renderRedirect();
    await waitFor(() => expect(location.href).toBe('/api/r/abc123'));
    expect(axios.get).toHaveBeenCalledWith('/api/r/abc123?probe=1');
  });

  it('shows the password prompt when the probe answers 403', async () => {
    expect(await openPasswordPrompt()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock/i })).toBeDisabled();
  });

  it('exchanges the password for an unlock token and never puts the password in a URL', async () => {
    const user = userEvent.setup();
    await openPasswordPrompt();
    axios.post.mockResolvedValue({ data: { success: true, unlockToken: 'tok.en/+=' } });

    await user.type(screen.getByLabelText('Link Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => expect(location.href).toBe(`/api/r/abc123?unlockToken=${encodeURIComponent('tok.en/+=')}`));
    expect(axios.post).toHaveBeenCalledWith('/api/r/abc123/unlock', { password: 'correct horse' });
    expect(location.href).not.toContain('correct');
    expect(axios.get.mock.calls.flat().join(' ')).not.toContain('correct');
  });

  it('shows "Incorrect password" on a 401 and clears it when the user types again', async () => {
    const user = userEvent.setup();
    await openPasswordPrompt();
    axios.post.mockRejectedValue(apiError(401, { message: 'Incorrect password' }));

    await user.type(screen.getByLabelText('Link Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /unlock/i }));

    expect(await screen.findByText('Incorrect password. Please try again.')).toBeInTheDocument();
    expect(location.href).toBe('http://localhost/abc123');

    await user.type(screen.getByLabelText('Link Password'), 'x');
    expect(screen.queryByText('Incorrect password. Please try again.')).not.toBeInTheDocument();
  });

  it('tells the user to wait after too many attempts (429)', async () => {
    const user = userEvent.setup();
    await openPasswordPrompt();
    axios.post.mockRejectedValue(apiError(429));

    await user.type(screen.getByLabelText('Link Password'), 'guess');
    await user.click(screen.getByRole('button', { name: /unlock/i }));

    expect(await screen.findByText('Too many attempts. Please try again in a few minutes.')).toBeInTheDocument();
  });

  it.each([
    [404, {}, 'Link Not Found'],
    [410, {}, 'Link No Longer Available'],
    [410, { limitReached: true }, 'Click Limit Reached'],
  ])('a %i probe (%o) shows "%s"', async (status, data, heading) => {
    axios.get.mockRejectedValue(apiError(status, data));
    renderRedirect();
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(location.href).toBe('http://localhost/abc123');
  });
});
