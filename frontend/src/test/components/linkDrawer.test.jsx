// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LinkDrawer from '../../components/links/LinkDrawer';
import { ConfirmProvider } from '../../context/ConfirmContext';
import useLinkStore from '../../context/linkStore';
import { linkService } from '../../services';

vi.mock('../../services', () => ({
  linkService: { toggleLinkStatus: vi.fn(), deleteLink: vi.fn(), updateLink: vi.fn() },
}));

const baseLink = {
  _id: 'l1',
  shortCode: 'abc123',
  shortUrl: 'http://localhost:3000/abc123',
  originalUrl: 'https://example.com/landing',
  title: 'Spring launch',
  description: 'Main campaign',
  category: 'marketing',
  tags: ['spring'],
  clicks: 3,
  isActive: true,
  createdAt: '2026-01-15T10:00:00.000Z',
  qrCode: 'data:image/png;base64,AAAA',
};

function renderDrawer(link = baseLink, { open = true } = {}) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <ConfirmProvider>
        <LinkDrawer link={link} open={open} onClose={onClose} />
      </ConfirmProvider>
      <Toaster />
    </MemoryRouter>
  );
  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  useLinkStore.setState({ links: [baseLink] });
});

describe('LinkDrawer: read-only view', () => {
  it('renders nothing without a link', () => {
    const { container } = render(
      <MemoryRouter>
        <ConfirmProvider>
          <LinkDrawer link={null} open onClose={() => {}} />
        </ConfirmProvider>
      </MemoryRouter>
    );
    expect(container.textContent).toBe('');
  });

  it.each([
    [{}, 'Active'],
    [{ isActive: false }, 'Paused'],
    [{ abuseFlag: true }, 'Flagged'],
    [{ maxClicks: 3, clicks: 3 }, 'Limit Reached'],
    [{ expiryDate: '2020-01-01T00:00:00.000Z' }, 'Expired'],
  ])('status badge for %o is "%s"', (overrides, badge) => {
    renderDrawer({ ...baseLink, ...overrides });
    expect(screen.getByText(badge)).toBeInTheDocument();
  });

  it('shows the short URL, destination, title and summary settings', () => {
    renderDrawer();
    expect(screen.getByText(baseLink.shortUrl)).toBeInTheDocument();
    expect(screen.getAllByText(baseLink.originalUrl).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Spring launch' })).toBeInTheDocument();
    expect(screen.getByText('Unlimited opens')).toBeInTheDocument();
    expect(screen.getByText('Never expires')).toBeInTheDocument();
    expect(screen.getByText('#spring')).toBeInTheDocument();
  });

  it('shows click-quota progress', () => {
    renderDrawer({ ...baseLink, clicks: 3, maxClicks: 10 });
    expect(screen.getByText(/3 \/ 10 opens \(\s*30\s*%\)/)).toBeInTheDocument();
    expect(screen.getByText('7 opens remaining')).toBeInTheDocument();
  });

  it('lists A/B variants for a split link', () => {
    renderDrawer({
      ...baseLink,
      routingType: 'ab_test',
      variants: [
        { id: 'a', name: 'Control', url: 'https://a.example.com', weight: 60, clicks: 4 },
        { id: 'b', name: 'Challenger', url: 'https://b.example.com', weight: 40 },
      ],
    });
    expect(screen.getByText('A/B Traffic Split Experiment')).toBeInTheDocument();
    expect(screen.getByText('60% weight')).toBeInTheDocument();
    expect(screen.getByText('(0 clicks)')).toBeInTheDocument();
  });
});

describe('LinkDrawer: actions', () => {
  it('copies the short URL', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /^copy$/i }));
    // userEvent.setup() installs a clipboard stub we can read back.
    expect(await navigator.clipboard.readText()).toBe(baseLink.shortUrl);
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });

  it('pauses the link and updates the store', async () => {
    linkService.toggleLinkStatus.mockResolvedValue({ link: { ...baseLink, isActive: false } });
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByTitle('Pause link'));
    expect(await screen.findByText('Link paused')).toBeInTheDocument();
    expect(linkService.toggleLinkStatus).toHaveBeenCalledWith('l1');
    expect(useLinkStore.getState().links[0].isActive).toBe(false);
  });

  it('deletes only after confirmation, then closes', async () => {
    linkService.deleteLink.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = await screen.findByText('Delete Short Link');
    expect(linkService.deleteLink).not.toHaveBeenCalled();

    await user.click(within(dialog.closest('div[class*="panel"]') || document.body).getByRole('button', { name: 'Delete Link' }));
    await waitFor(() => expect(linkService.deleteLink).toHaveBeenCalledWith('l1'));
    expect(await screen.findByText('Link deleted')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(useLinkStore.getState().links).toEqual([]);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('LinkDrawer: editing', () => {
  it('prefills the form and sends only what changed, with remove flags', async () => {
    const link = {
      ...baseLink,
      password: '$2a$10$hash',
      maxClicks: 10,
      iosRedirect: 'https://apps.apple.com/app/id1',
      utm: { source: 'news', medium: 'email', campaign: '' },
    };
    linkService.updateLink.mockResolvedValue({ link: { ...link, title: 'Renamed' } });
    const user = userEvent.setup();
    renderDrawer(link);

    await user.click(screen.getByRole('button', { name: 'Edit Details' }));
    const title = screen.getByLabelText('Title');
    expect(title).toHaveValue('Spring launch');
    await user.clear(title);
    await user.type(title, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Remove password' }));
    await user.click(screen.getByRole('button', { name: 'Remove limit' }));
    await user.clear(screen.getByPlaceholderText('https://apps.apple.com/app/id...'));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(linkService.updateLink).toHaveBeenCalled());
    const [id, payload] = linkService.updateLink.mock.calls[0];
    expect(id).toBe('l1');
    expect(payload).toEqual({
      title: 'Renamed',
      description: 'Main campaign',
      category: 'marketing',
      tags: ['spring'],
      removePassword: true,
      removeMaxClicks: true,
      removeIosRedirect: true,
      utm: { source: 'news', medium: 'email', campaign: '' },
    });
    expect(await screen.findByText('Link updated successfully')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Details' })).toBeInTheDocument();
  });

  it('sends a new destination, password and tag', async () => {
    linkService.updateLink.mockResolvedValue({ link: baseLink });
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Edit Details' }));
    const destination = screen.getByPlaceholderText('https://yourcompany.com/landing-page');
    await user.clear(destination);
    await user.type(destination, 'https://example.com/new');
    await user.type(screen.getByPlaceholderText('Enter secret password to protect'), ' s3cret ');
    await user.type(screen.getByLabelText(/tags/i), 'promo{Enter}');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(linkService.updateLink).toHaveBeenCalled());
    expect(linkService.updateLink.mock.calls[0][1]).toEqual({
      title: 'Spring launch',
      description: 'Main campaign',
      category: 'marketing',
      tags: ['spring', 'promo'],
      originalUrl: 'https://example.com/new',
      password: 's3cret',
    });
  });

  it('shows the server error and stays in edit mode', async () => {
    linkService.updateLink.mockRejectedValue(Object.assign(new Error('x'), { response: { data: { message: 'originalUrl: Destination is a private or restricted address' } } }));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Edit Details' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('originalUrl: Destination is a private or restricted address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});
