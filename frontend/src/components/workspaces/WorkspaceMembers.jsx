import { useState } from 'react';
import { Trash2, RotateCw, Network } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { workspaceService } from '../../services';
import InviteLinkNotice from './InviteLinkNotice';
import InviteForm from './InviteForm';
import useWorkspaceInvites from './useWorkspaceInvites';
import { roleLabel, roleOptions } from '../../utils/roles';

const ROLE_ORDER = ['owner', 'admin', 'creator', 'viewer'];
// Built-in roles by rank, then custom roles.
const roleRank = (role) => (ROLE_ORDER.includes(role) ? ROLE_ORDER.indexOf(role) : ROLE_ORDER.length);

/**
 * Members and pending invites of one workspace, plus the invite form.
 * @param {{ workspaceId: string, detail: object, canManage: boolean, onChanged: () => Promise<void>,
 *   roleNames?: Record<string, string>, customRoles?: { id: string, name: string }[] }} props
 *   detail: GET /workspaces/:id's workspace (members populated); onChanged reloads it.
 *   roleNames: custom role id -> name; customRoles: the org's custom roles, for the invite dropdown.
 */
export default function WorkspaceMembers({ workspaceId, detail, canManage, onChanged, roleNames = {}, customRoles = [] }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { sendInvite, isSending, createdInvite, setCreatedInvite } = useWorkspaceInvites(workspaceId, { onChanged });
  const isBusy = isUpdating || isSending;

  const handleRevoke = async (invite) => {
    setIsUpdating(true);
    try {
      await workspaceService.revokeInvite(workspaceId, invite.id);
      if (createdInvite?.email === invite.email) setCreatedInvite(null);
      await onChanged();
      toast.success('Invite revoked');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to revoke invite');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async (userId) => {
    setIsUpdating(true);
    try {
      await workspaceService.removeMember(workspaceId, userId);
      await onChanged();
      toast.success('Member removed');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove member');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-paper-500">Members</p>
      <ul className="space-y-1.5">
        {[...detail.members]
          .sort((a, b) => roleRank(a.role) - roleRank(b.role))
          .map((member) => (
            <li
              key={member.user._id}
              className="flex items-center justify-between rounded-lg bg-ink-800/50 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-paper-200">{member.user.name}</p>
                <p className="truncate text-xs text-paper-500">{member.user.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {member.managedBy === 'scim' && (
                  <span
                    className="badge-accent inline-flex items-center gap-1"
                    title="Added by your identity provider (SCIM). Remove them there, not here."
                  >
                    <Network size={11} /> Directory
                  </span>
                )}
                <span className="badge-neutral capitalize">{roleLabel(member.role, roleNames)}</span>
                {canManage && member.role !== 'owner' && member.managedBy !== 'scim' && (
                  <button
                    type="button"
                    onClick={() => handleRemove(member.user._id)}
                    disabled={isBusy}
                    className="text-paper-500 hover:text-danger"
                    aria-label="Remove member"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
      </ul>
      {canManage && detail.members.some((m) => m.managedBy === 'scim') && (
        <p className="mt-2 text-xs text-paper-500">
          Members marked <span className="text-paper-300">Directory</span> are added and removed by your
          organization&apos;s identity provider (SCIM), so they can&apos;t be removed or re-invited here. You can still
          change their role.
        </p>
      )}

      {canManage && detail.pendingInvites?.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-paper-500">
            Pending invites
          </p>
          <ul className="space-y-1.5">
            {detail.pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between rounded-lg bg-ink-800/50 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-paper-200">{invite.email}</p>
                  <p className="truncate text-xs text-paper-500">
                    Expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="badge-neutral capitalize">{roleLabel(invite.role, roleNames)}</span>
                  <button
                    type="button"
                    onClick={() => sendInvite(invite.email, invite.role)}
                    disabled={isBusy}
                    className="text-paper-500 hover:text-paper-200"
                    aria-label="Resend invite"
                    title="Resend (new link, 7 more days)"
                  >
                    <RotateCw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevoke(invite)}
                    disabled={isBusy}
                    className="text-paper-500 hover:text-danger"
                    aria-label="Revoke invite"
                    title="Revoke"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {canManage && createdInvite && (
        <InviteLinkNotice invite={createdInvite} onDismiss={() => setCreatedInvite(null)} />
      )}

      {canManage && <InviteForm onInvite={sendInvite} isBusy={isBusy} roleOptions={roleOptions(customRoles)} />}
    </>
  );
}
