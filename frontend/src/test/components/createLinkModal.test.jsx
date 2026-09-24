// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'react-hot-toast';
import CreateLinkModal from '../../components/CreateLinkModal';
import useAuthStore from '../../context/authStore';
import useLinkStore from '../../context/linkStore';
import { linkService } from '../../services';
import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';

vi.mock('../../services', () => ({
  linkService: { createLink: vi.fn() },
}));

const apiError = (data) => Object.assign(new Error('Request failed'), { response: { status: 400, data } });

const createdLink = {
  _id: 'l1',
  shortCode: 'abc123',
  shortUrl: 'http://localhost:3000/abc123',
  originalUrl: 'https://example.com/landing',
};

function renderModal() {
  const onClose = vi.fn();
  render(
    <>
      <CreateLinkModal open onClose={onClose} />
      <Toaster />
    </>
  );
  return { onClose };
}

const createButton = () => screen.getByRole('button', { name: /create link/i });
const tab = (name) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAuthStore.setState({ user: { id: 'u1', defaultLinkCategory: 'social', defaultUtm: {} } });
  useLinkStore.setState({ links: [] });
});

describe('CreateLinkModal: validation', () => {
  it('the destination URL is a required field (browser check on the General tab)', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByLabelText(/destination/i)).toBeRequired();
    await user.click(createButton());
    expect(linkService.createLink).not.toHaveBeenCalled();
  });

  it('submitting from another tab with no URL shows "Destination URL is required"', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tab(/utm studio/i));
    await user.click(createButton());
    expect(await screen.findByText('Destination URL is required')).toBeInTheDocument();
    expect(linkService.createLink).not.toHaveBeenCalled();
  });

  it('password protection with a blank password shows an error and sends nothing', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText(/destination/i), 'https://example.com/landing');
    await user.click(tab(/security & access/i));
    await user.click(screen.getByRole('button', { name: /enable password/i }));
    await user.type(screen.getByPlaceholderText(/secret password/i), '   ');
    await user.click(createButton());
    expect(await screen.findByText('Please enter a password for protection')).toBeInTheDocument();
    expect(linkService.createLink).not.toHaveBeenCalled();
  });

  it('has no client-side URL format check: an invalid URL is sent and the server\'s error is shown', async () => {
    linkService.createLink.mockRejectedValue(apiError({ message: 'Please provide a valid URL' }));
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText(/destination/i), 'not a url');
    await user.click(createButton());
    expect(await screen.findByText('Please provide a valid URL')).toBeInTheDocument();
    expect(linkService.createLink).toHaveBeenCalledTimes(1);
  });

  it('falls back to express-validator\'s first error, then to a generic message', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText(/destination/i), 'https://example.com');

    linkService.createLink.mockRejectedValueOnce(apiError({ errors: [{ msg: 'Title cannot exceed 200 characters' }] }));
    await user.click(createButton());
    expect(await screen.findByText('Title cannot exceed 200 characters')).toBeInTheDocument();

    linkService.createLink.mockRejectedValueOnce(new Error('Network Error'));
    await user.click(createButton());
    expect(await screen.findByText('Failed to create link')).toBeInTheDocument();
  });
});

describe('CreateLinkModal: success', () => {
  it('sends the normalised payload, adds the link to the store and shows the success view', async () => {
    linkService.createLink.mockResolvedValue({ link: createdLink });
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText(/destination/i), 'example.com/landing');
    await user.click(createButton());

    expect(await screen.findByText('Link Created Successfully')).toBeInTheDocument();
    expect(screen.getByText(createdLink.shortUrl)).toBeInTheDocument();
    expect(screen.getByText('Link created successfully!')).toBeInTheDocument();

    expect(linkService.createLink).toHaveBeenCalledWith({
      originalUrl: 'https://example.com/landing',
      category: 'social',
      tags: [],
      qrConfig: DEFAULT_QR_CONFIG,
    });
    expect(useLinkStore.getState().links.map((l) => l._id)).toContain('l1');
  });

  it('includes optional fields only when set', async () => {
    linkService.createLink.mockResolvedValue({ link: createdLink });
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText(/destination/i), 'https://example.com/landing');
    await user.type(screen.getByLabelText(/custom alias/i), 'spring-sale');
    await user.click(tab(/security & access/i));
    await user.click(screen.getByRole('button', { name: /enable password/i }));
    await user.type(screen.getByPlaceholderText(/secret password/i), ' hunter2 ');
    await user.click(createButton());

    await waitFor(() => expect(linkService.createLink).toHaveBeenCalled());
    const payload = linkService.createLink.mock.calls[0][0];
    expect(payload).toMatchObject({ originalUrl: 'https://example.com/landing', customAlias: 'spring-sale', password: 'hunter2' });
    expect(payload).not.toHaveProperty('title');
    expect(payload).not.toHaveProperty('utm');
    expect(payload).not.toHaveProperty('expiryDate');
  });

  it('Cancel closes the modal', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    const footer = createButton().parentElement;
    await user.click(within(footer).getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
