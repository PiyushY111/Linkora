// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'react-hot-toast';
import CreateApiKeyModal from '../../components/developer/CreateApiKeyModal';
import { developerService } from '../../services';

vi.mock('../../services', () => ({
  developerService: { createKey: vi.fn() },
}));

const apiError = (message) => Object.assign(new Error('Request failed'), { response: { status: 400, data: { message } } });

function renderModal(props = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <>
      <CreateApiKeyModal open onClose={onClose} onCreated={onCreated} {...props} />
      <Toaster />
    </>
  );
  return { onClose, onCreated };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateApiKeyModal', () => {
  const submit = (user) => user.click(screen.getByRole('button', { name: /generate|create/i }));

  it('an empty name is stopped by the browser\'s required-field check', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByLabelText(/key name/i)).toBeRequired();
    await submit(user);
    expect(developerService.createKey).not.toHaveBeenCalled();
  });

  it('a whitespace-only name shows "Key name is required"', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText(/key name/i), '   ');
    await submit(user);
    expect(await screen.findByText('Key name is required')).toBeInTheDocument();
    expect(developerService.createKey).not.toHaveBeenCalled();
  });

  it('requires at least one scope', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText(/key name/i), 'CI key');
    // Three scopes are preselected; untick them.
    for (const scope of ['links:read', 'links:write', 'analytics:read']) {
      await user.click(screen.getByRole('checkbox', { name: new RegExp(scope) }));
    }
    await submit(user);
    expect(await screen.findByText('Select at least one scope')).toBeInTheDocument();
    expect(developerService.createKey).not.toHaveBeenCalled();
  });

  it('creates the key with the chosen settings and reveals the secret once', async () => {
    developerService.createKey.mockResolvedValue({ rawSecret: 'lnk_live_s3cr3t', key: { _id: 'k1' } });
    const user = userEvent.setup();
    const { onCreated } = renderModal();

    await user.type(screen.getByLabelText(/key name/i), '  CI key  ');
    await user.click(screen.getByRole('checkbox', { name: /links:delete/ }));
    await submit(user);

    expect(await screen.findByText('lnk_live_s3cr3t')).toBeInTheDocument();
    expect(developerService.createKey).toHaveBeenCalledWith({
      name: 'CI key',
      environment: 'live',
      scopes: ['links:read', 'links:write', 'analytics:read', 'links:delete'],
      expiresInDays: 0,
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(screen.getByText('API Key Created')).toBeInTheDocument();
  });

  it('shows the server\'s error message and keeps the form', async () => {
    developerService.createKey.mockRejectedValue(apiError('Too many keys'));
    const user = userEvent.setup();
    const { onCreated } = renderModal();

    await user.type(screen.getByLabelText(/key name/i), 'CI key');
    await submit(user);

    expect(await screen.findByText('Too many keys')).toBeInTheDocument();
    expect(screen.getByLabelText(/key name/i)).toHaveValue('CI key');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('closes from the cancel button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
