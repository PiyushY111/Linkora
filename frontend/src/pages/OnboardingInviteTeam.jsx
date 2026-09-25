import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Users, ArrowRight } from 'lucide-react';
import useAuthStore from '../context/authStore';
import InviteForm from '../components/workspaces/InviteForm';
import InviteLinkNotice from '../components/workspaces/InviteLinkNotice';
import useWorkspaceInvites from '../components/workspaces/useWorkspaceInvites';
import useWorkspaceRoles from '../components/workspaces/useWorkspaceRoles';
import { roleOptions } from '../utils/roles';

/**
 * Right after a team signup: invite teammates into the new workspace, or
 * skip. Invites work exactly as on the Workspaces page (a copyable link per
 * invite; there's no email delivery yet).
 */
const OnboardingInviteTeam = () => {
  const { activeWorkspace } = useAuthStore();
  const { sendInvite, isSending } = useWorkspaceInvites(activeWorkspace?.id);
  const { roles: customRoles } = useWorkspaceRoles(activeWorkspace?.id);
  const [sent, setSent] = useState([]); // every { email, url } created on this page

  const handleInvite = async (email, role) => {
    const created = await sendInvite(email, role);
    // A resend replaces that email's earlier link, so keep only the newest.
    if (created) setSent((prev) => [created, ...prev.filter((s) => s.email !== created.email)]);
    return created;
  };

  const dismiss = (email) => setSent((prev) => prev.filter((s) => s.email !== email));

  return (
    <>
      <Helmet>
        <title>Invite your team — Linkora</title>
      </Helmet>

      <div className="relative flex min-h-screen items-center justify-center bg-ink-950 bg-grid px-4 py-10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950 via-transparent to-ink-950" />

        <div className="relative w-full max-w-lg animate-fade-up">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/logo.svg" alt="" width={28} height={28} />
            <span className="text-lg font-bold text-paper-100">Linkora</span>
          </div>

          <div className="panel p-7">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-ink-800 ring-1 ring-ink-600">
              <Users size={18} className="text-paper-300" />
            </div>
            <h1 className="text-xl font-bold text-paper-100">Invite your team</h1>
            <p className="mt-1 text-sm text-paper-500">
              Add teammates to {activeWorkspace?.name ?? 'your workspace'}. Each invite gives you a link to share; it works
              once, for that email, for 7 days.
            </p>

            {activeWorkspace?.permissions?.includes('members:manage') ? (
              <InviteForm
                onInvite={handleInvite}
                isBusy={isSending}
                defaultRole="creator"
                roleOptions={roleOptions(customRoles)}
              />
            ) : (
              <p className="mt-4 text-sm text-paper-400">Your role in this workspace can&apos;t invite members.</p>
            )}

            {sent.map((invite) => (
              <InviteLinkNotice key={invite.email} invite={invite} onDismiss={() => dismiss(invite.email)} />
            ))}

            <div className="mt-6 flex items-center justify-between border-t border-ink-700 pt-4">
              <p className="text-xs text-paper-500">You can invite people later from Workspaces.</p>
              <Link to="/dashboard" replace className={sent.length > 0 ? 'btn-primary' : 'btn-secondary'}>
                {sent.length > 0 ? 'Continue to dashboard' : 'Skip for now'} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OnboardingInviteTeam;
