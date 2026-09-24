// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import Webhooks from '../../pages/Webhooks';
import { ConfirmProvider } from '../../context/ConfirmContext';
import useAuthStore from '../../context/authStore';
import { webhookService } from '../../services';

vi.mock('../../services', () => ({
  authService: { logout: vi.fn() },
  webhookService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), rotateSecret: vi.fn(), remove: vi.fn() },
}));

const hooks = [
  {
    _id: 'w1',
    url: 'https://hooks.example.com/a',
    description: 'Primary',
    events: ['link.clicked'],
    isActive: true,
    consecutiveFailures: 0,
    health: { totalDeliveries24h: 10, successful24h: 9 },
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'w2',
    url: 'https://hooks.example.com/b',
    events: ['link.created'],
    isActive: false,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

function renderPage() {
  render(
    <HelmetProvider>
      <MemoryRouter>
        <ConfirmProvider>
          <Webhooks />
        </ConfirmProvider>
      </MemoryRouter>
      <Toaster />
    </HelmetProvider>
  );
}

const dialogWithTitle = async (title) => (await screen.findByRole('heading', { name: title })).closest('div.panel-elevated');

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1', email: 'ada@example.com' }, token: 't', isBootstrapping: false });
  webhookService.list.mockResolvedValue({ webhooks: hooks });
});

describe('Webhooks: list', () => {
  it('lists endpoints with summary stats', async () => {
    renderPage();
    expect(await screen.findByText('https://hooks.example.com/a')).toBeInTheDocument();
    expect(screen.getByText('https://hooks.example.com/b')).toBeInTheDocument();
    expect(screen.getByText('1 Active')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('(10 sends)')).toBeInTheDocument();
    expect(screen.getByText('/ 1 paused')).toBeInTheDocument();
  });

  it('shows the empty state with no endpoints', async () => {
    webhookService.list.mockResolvedValue({ webhooks: [] });
    renderPage();
    expect(await screen.findByText('No webhooks configured')).toBeInTheDocument();
    expect(screen.queryByText('Total Endpoints')).not.toBeInTheDocument();
  });

  it('reports a failed load', async () => {
    webhookService.list.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByText('Failed to load webhooks')).toBeInTheDocument();
  });
});

describe('Webhooks: create', () => {
  it('requires at least one event', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('https://hooks.example.com/a');
    await user.click(screen.getByRole('button', { name: /new webhook/i }));
    const dialog = await dialogWithTitle('Register New Webhook Endpoint');
    await user.type(within(dialog).getByLabelText(/endpoint url/i), 'https://hooks.example.com/new');
    await user.click(within(dialog).getByRole('button', { name: 'Select all' }));
    await user.click(within(dialog).getByRole('button', { name: 'Deselect all' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create Webhook' }));
    expect(await screen.findByText('Select at least one event')).toBeInTheDocument();
    expect(webhookService.create).not.toHaveBeenCalled();
  });

  it('creates, shows the signing secret once, reloads, and resets the form', async () => {
    webhookService.create.mockResolvedValue({ webhook: { _id: 'w3', secret: 'whsec_abc123' } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('https://hooks.example.com/a');

    await user.click(screen.getByRole('button', { name: /new webhook/i }));
    let dialog = await dialogWithTitle('Register New Webhook Endpoint');
    await user.click(within(dialog).getByRole('button', { name: 'Use Built-in Echo Endpoint' }));
    expect(within(dialog).getByLabelText(/endpoint url/i)).toHaveValue('http://127.0.0.1:5001/api/webhooks/debug/echo');
    await user.click(within(dialog).getByRole('checkbox', { name: /link\.deleted/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create Webhook' }));

    expect(await screen.findByText('whsec_abc123')).toBeInTheDocument();
    expect(screen.getByText('Webhook Endpoint Provisioned')).toBeInTheDocument();
    expect(webhookService.create).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:5001/api/webhooks/debug/echo',
      description: 'Local Built-in Echo Receiver',
      events: ['link.clicked', 'link.created', 'link.limit_reached', 'link.deleted'],
    });
    await waitFor(() => expect(webhookService.list).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: /i have saved this secret/i }));
    await user.click(screen.getByRole('button', { name: /new webhook/i }));
    dialog = await dialogWithTitle('Register New Webhook Endpoint');
    expect(within(dialog).getByLabelText(/endpoint url/i)).toHaveValue('');
  });

  it('shows the server error', async () => {
    webhookService.create.mockRejectedValue(Object.assign(new Error('x'), { response: { data: { message: 'Endpoint URL validation failed: Destination is a private or restricted address' } } }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('https://hooks.example.com/a');
    await user.click(screen.getByRole('button', { name: /new webhook/i }));
    const dialog = await dialogWithTitle('Register New Webhook Endpoint');
    await user.type(within(dialog).getByLabelText(/endpoint url/i), 'https://10.0.0.1/hook');
    await user.click(within(dialog).getByRole('button', { name: 'Create Webhook' }));
    expect(await screen.findByText(/private or restricted address/)).toBeInTheDocument();
  });
});

describe('Webhooks: manage', () => {
  it('edits an endpoint', async () => {
    webhookService.update.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('https://hooks.example.com/a');

    await user.click(screen.getAllByRole('button', { name: 'Edit webhook' })[0]);
    const dialog = await dialogWithTitle('Edit Webhook Endpoint');
    const desc = within(dialog).getByLabelText('Description');
    expect(desc).toHaveValue('Primary');
    await user.clear(desc);
    await user.type(desc, 'Renamed');
    await user.click(within(dialog).getByRole('checkbox', { name: /link\.expired/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Webhook updated')).toBeInTheDocument();
    expect(webhookService.update).toHaveBeenCalledWith('w1', {
      url: 'https://hooks.example.com/a',
      description: 'Renamed',
      events: ['link.clicked', 'link.expired'],
      isActive: true,
    });
  });

  it('pauses an endpoint', async () => {
    webhookService.update.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('https://hooks.example.com/a');
    await user.click(screen.getAllByRole('button', { name: 'Toggle active' })[0]);
    expect(await screen.findByText('Webhook paused')).toBeInTheDocument();
    expect(webhookService.update).toHaveBeenCalledWith('w1', { isActive: false });
    expect(screen.getByText('0 Active')).toBeInTheDocument();
  });

  it('rotates a secret only after confirmation and shows the new one', async () => {
    webhookService.rotateSecret.mockResolvedValue({ secret: 'whsec_rotated' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('https://hooks.example.com/a');
    await user.click(screen.getAllByRole('button', { name: 'Rotate secret' })[0]);
    await user.click(await screen.findByRole('button', { name: 'Rotate Secret' }));
    expect(await screen.findByText('whsec_rotated')).toBeInTheDocument();
    expect(webhookService.rotateSecret).toHaveBeenCalledWith('w1');
  });

  it('deletes only after confirmation', async () => {
    webhookService.remove.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('https://hooks.example.com/a');
    await user.click(screen.getAllByRole('button', { name: 'Delete webhook' })[0]);
    expect(webhookService.remove).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Delete Webhook' }));
    expect(await screen.findByText('Webhook and delivery logs deleted')).toBeInTheDocument();
    // The URL is also shown in the closing confirmation dialog; wait for both to go.
    await waitFor(() => expect(screen.queryByText('https://hooks.example.com/a')).not.toBeInTheDocument());
  });
});
