import { useState } from 'react';
import toast from 'react-hot-toast';
import { workspaceService } from '../../services';

/**
 * Sending invites for one workspace. Sending to an email that already has a
 * pending invite is the resend: new link, fresh 7-day expiry.
 * @param {string} workspaceId
 * @param {{ onChanged?: () => Promise<void> | void }} [options] - e.g. reload the member list
 */
export default function useWorkspaceInvites(workspaceId, { onChanged } = {}) {
  const [isSending, setIsSending] = useState(false);
  const [createdInvite, setCreatedInvite] = useState(null); // latest { email, url }

  /** @returns {Promise<{ email: string, url: string } | null>} the new link, or null on failure */
  const sendInvite = async (email, role) => {
    setIsSending(true);
    try {
      const data = await workspaceService.createInvite(workspaceId, email, role);
      const created = { email: data.invite.email, url: data.inviteUrl };
      setCreatedInvite(created);
      await onChanged?.();
      toast.success(data.resent ? 'Invite resent' : 'Invite created');
      return created;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create invite');
      return null;
    } finally {
      setIsSending(false);
    }
  };

  return { sendInvite, isSending, createdInvite, setCreatedInvite };
}
