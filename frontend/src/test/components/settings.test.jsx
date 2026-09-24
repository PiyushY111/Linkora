// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import Settings from '../../pages/Settings';
import { ConfirmProvider } from '../../context/ConfirmContext';
import useAuthStore from '../../context/authStore';
import { authService, analyticsService } from '../../services';

vi.mock('../../services', () => ({
  authService: {
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    exportAccountData: vi.fn(),
    deleteAccount: vi.fn(),
    logout: vi.fn(),
  },
  analyticsService: { exportAnalytics: vi.fn() },
}));

const user0 = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  bio: 'Analyst',
  avatarColor: 'violet',
  defaultLinkCategory: 'sales',
  defaultExpirationDays: 7,
  defaultUtm: { source: 'news', medium: 'email', campaign: 'launch' },
  defaultAnalyticsRange: '30d',
  anonymizeVisitorIps: false,
  preferences: { emailNotifications: true, theme: 'dark' },
  totalClicks: 1234,
  createdAt: '2025-03-01T00:00:00.000Z',
};

function renderSettings() {
  render(
    <HelmetProvider>
      <MemoryRouter>
        <ConfirmProvider>
          <Settings />
        </ConfirmProvider>
      </MemoryRouter>
      <Toaster />
    </HelmetProvider>
  );
}

const openTab = (user, name) => user.click(screen.getByRole('button', { name }));
const apiError = (message) => Object.assign(new Error('x'), { response: { data: { message } } });

let realLocation;
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: user0, token: 'tok', isBootstrapping: false });
  authService.updateProfile.mockImplementation(async (patch) => ({ user: { ...useAuthStore.getState().user, ...patch } }));
  realLocation = window.location;
});
afterEach(() => {
  Object.defineProperty(window, 'location', { value: realLocation, configurable: true, writable: true });
});

describe('Settings: profile', () => {
  it('fills the form from the user and saves trimmed values', async () => {
    const user = userEvent.setup();
    renderSettings();

    const nameInput = screen.getByLabelText('Full Name');
    expect(nameInput).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText('Email Address')).toBeDisabled();
    expect(screen.getByText('7/500 characters')).toBeInTheDocument();
    expect(screen.getByText('Violet')).toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, '  Ada K.  ');
    await user.click(screen.getByTitle('Cyan'));
    await user.click(screen.getByRole('button', { name: /save profile changes/i }));

    expect(await screen.findByText('Profile updated successfully')).toBeInTheDocument();
    expect(authService.updateProfile).toHaveBeenCalledWith({ name: 'Ada K.', bio: 'Analyst', avatarColor: 'cyan' });
    expect(useAuthStore.getState().user.name).toBe('Ada K.');
  });

  it('keeps unsaved edits when switching tabs and back', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.clear(screen.getByLabelText('Full Name'));
    await user.type(screen.getByLabelText('Full Name'), 'Unsaved');
    await openTab(user, /security & sessions/i);
    await openTab(user, /profile & account/i);
    expect(screen.getByLabelText('Full Name')).toHaveValue('Unsaved');
  });

  it('shows the server error', async () => {
    authService.updateProfile.mockRejectedValue(apiError('Name too long'));
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole('button', { name: /save profile changes/i }));
    expect(await screen.findByText('Name too long')).toBeInTheDocument();
  });
});

describe('Settings: link defaults', () => {
  it('fills from the user and saves category, expiry and trimmed UTMs', async () => {
    const user = userEvent.setup();
    renderSettings();
    await openTab(user, /link defaults/i);

    expect(screen.getByLabelText('Default Expiration Rule')).toHaveValue('7');
    expect(screen.getByLabelText('utm_source')).toHaveValue('news');

    await user.click(screen.getByRole('button', { name: 'Social' }));
    await user.selectOptions(screen.getByLabelText('Default Expiration Rule'), '30');
    await user.clear(screen.getByLabelText('utm_campaign'));
    await user.type(screen.getByLabelText('utm_campaign'), ' spring ');
    await user.click(screen.getByRole('button', { name: /save default presets/i }));

    expect(await screen.findByText('Link creation defaults saved')).toBeInTheDocument();
    expect(authService.updateProfile).toHaveBeenCalledWith({
      defaultLinkCategory: 'social',
      defaultExpirationDays: 30,
      defaultUtm: { source: 'news', medium: 'email', campaign: 'spring' },
    });
  });
});

describe('Settings: security', () => {
  const fill = async (user, { current = 'OldPass123', next = 'NewPass123', confirm = next } = {}) => {
    await user.type(screen.getByLabelText('Current Password'), current);
    await user.type(screen.getByLabelText('New Password'), next);
    await user.type(screen.getByLabelText('Confirm New Password'), confirm);
    await user.click(screen.getByRole('button', { name: /update password/i }));
  };

  it('rejects a new password under 6 characters, and mismatched confirmation', async () => {
    const user = userEvent.setup();
    renderSettings();
    await openTab(user, /security & sessions/i);

    await fill(user, { next: 'abc', confirm: 'abc' });
    expect(await screen.findByText('New password must be at least 6 characters')).toBeInTheDocument();
    expect(screen.getByText('Too short')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('New Password'));
    await user.clear(screen.getByLabelText('Confirm New Password'));
    await user.clear(screen.getByLabelText('Current Password'));
    await fill(user, { next: 'NewPass123', confirm: 'Different1' });
    expect(await screen.findByText('New passwords do not match')).toBeInTheDocument();
    expect(authService.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password and clears the form', async () => {
    authService.changePassword.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderSettings();
    await openTab(user, /security & sessions/i);
    await fill(user);
    expect(await screen.findByText('Password changed successfully')).toBeInTheDocument();
    expect(authService.changePassword).toHaveBeenCalledWith('OldPass123', 'NewPass123');
    expect(screen.getByLabelText('Current Password')).toHaveValue('');
  });

  it('shows the server error', async () => {
    authService.changePassword.mockRejectedValue(apiError('Current password is incorrect'));
    const user = userEvent.setup();
    renderSettings();
    await openTab(user, /security & sessions/i);
    await fill(user);
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
  });

  it('signs out from the session card', async () => {
    const user = userEvent.setup();
    renderSettings();
    await openTab(user, /security & sessions/i);
    await user.click(screen.getByRole('button', { name: /^sign out$/i }));
    expect(useAuthStore.getState().token).toBeNull();
  });
});

describe('Settings: analytics & privacy', () => {
  it('saves the range and anonymization, keeping other preferences', async () => {
    const user = userEvent.setup();
    renderSettings();
    await openTab(user, /analytics & privacy/i);

    const anonymize = screen.getByRole('switch', { name: /visitor ip anonymization/i });
    expect(anonymize).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: /email notifications/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Default Analytics Timeframe'), '24h');
    await user.click(anonymize);
    expect(anonymize).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    expect(await screen.findByText('Preferences updated successfully')).toBeInTheDocument();
    expect(authService.updateProfile).toHaveBeenCalledWith({
      defaultAnalyticsRange: '24h',
      anonymizeVisitorIps: true,
      preferences: { emailNotifications: true, theme: 'dark' },
    });
  });
});

describe('Settings: data', () => {
  it('exports the account archive', async () => {
    authService.exportAccountData.mockResolvedValue({ account: {} });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    renderSettings();
    await openTab(user, /data & danger zone/i);
    await user.click(screen.getByRole('button', { name: /download json archive/i }));
    expect(await screen.findByText('Account JSON archive exported')).toBeInTheDocument();
  });

  it('shows an error when the CSV export fails', async () => {
    analyticsService.exportAnalytics.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderSettings();
    await openTab(user, /data & danger zone/i);
    await user.click(screen.getByRole('button', { name: /download csv stream/i }));
    expect(await screen.findByText('Failed to export analytics CSV')).toBeInTheDocument();
  });

  it('deletes the account only after confirmation, then logs out and goes to /register', async () => {
    authService.deleteAccount.mockResolvedValue({ success: true });
    const location = { href: 'http://localhost/settings' };
    Object.defineProperty(window, 'location', { value: location, configurable: true, writable: true });
    const user = userEvent.setup();
    renderSettings();
    await openTab(user, /data & danger zone/i);

    await user.click(screen.getByRole('button', { name: /^delete account$/i }));
    expect(await screen.findByText('Permanently Delete Your Account')).toBeInTheDocument();
    expect(authService.deleteAccount).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete Everything Permanently' }));
    await waitFor(() => expect(location.href).toBe('/register'));
    expect(authService.deleteAccount).toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });
});
