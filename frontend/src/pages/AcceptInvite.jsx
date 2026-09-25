import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { Building2, ArrowRight, MailWarning } from 'lucide-react';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { workspaceService } from '../services';
import useAuthStore from '../context/authStore';

// Messages for the invite lookup's failure statuses.
const LOOKUP_ERRORS = {
  404: {
    title: 'Invite not found',
    description: 'This invite link is invalid, was revoked, or has already been used. Ask for a new one.',
  },
  410: {
    title: 'Invite expired',
    description: 'Invite links are valid for 7 days. Ask a workspace admin to resend it.',
  },
};

const AcceptInvite = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { token: sessionToken, user, setActiveWorkspace, refreshWorkspaces } = useAuthStore();
  const [invite, setInvite] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    workspaceService
      .getInvite(token)
      .then((data) => setInvite(data.invite))
      .catch((error) => {
        const status = error.response?.status;
        setLookupError(
          LOOKUP_ERRORS[status] ?? {
            title: 'Could not load invite',
            description: error.response?.data?.message || 'Please try again in a moment.',
          }
        );
      });
  }, [token]);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      const data = await workspaceService.acceptInvite(token);
      setActiveWorkspace(data.activeWorkspace);
      // Non-blocking: the switcher reloads the list when opened if this fails.
      refreshWorkspaces().catch(() => {});
      toast.success(`Joined ${data.activeWorkspace.name}`);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to accept invite');
    } finally {
      setIsAccepting(false);
    }
  };

  // Where login/register send the user back to once they're signed in.
  const authState = { from: `/invite/${token}`, email: invite?.email };
  // The server enforces this too; checking here just explains it up front.
  const signedInAsOther =
    Boolean(sessionToken && user?.email && invite) && user.email.toLowerCase() !== invite.email.toLowerCase();

  return (
    <>
      <Helmet>
        <title>Workspace invite — Linkora</title>
        {/* The URL carries the invite token; don't leak it to other sites. */}
        <meta name="referrer" content="no-referrer" />
      </Helmet>

      <div className="relative flex min-h-screen items-center justify-center bg-ink-950 bg-grid px-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950 via-transparent to-ink-950" />

        <div className="relative w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center justify-center gap-2">
            <img src="/logo.svg" alt="" width={28} height={28} />
            <span className="text-lg font-bold text-paper-100">Linkora</span>
          </Link>

          {lookupError ? (
            <EmptyState
              icon={MailWarning}
              title={lookupError.title}
              description={lookupError.description}
              action={
                <Link to={sessionToken ? '/dashboard' : '/'} className="btn-secondary">
                  {sessionToken ? 'Go to dashboard' : 'Back to home'}
                </Link>
              }
            />
          ) : !invite ? (
            <div className="panel space-y-3 p-6">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-6" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <div className="panel p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-ink-800 ring-1 ring-ink-600">
                <Building2 size={18} className="text-paper-300" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-paper-100">
                You&apos;ve been invited to join {invite.workspace.name}
              </h1>
              <p className="mt-2 text-sm text-paper-500">
                {invite.organization.name && <>{invite.organization.name} · </>}
                You&apos;ll join as <span className="font-semibold capitalize text-paper-200">{invite.role}</span>.
              </p>
              <p className="mt-1 text-xs text-paper-500">
                Sent to <span className="text-paper-300">{invite.email}</span>
              </p>

              {sessionToken ? (
                <>
                  {signedInAsOther && (
                    <p className="mt-4 rounded-lg bg-ink-800/60 px-3 py-2 text-xs text-paper-300">
                      You&apos;re signed in as {user.email}. This invite can only be accepted by {invite.email}.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleAccept}
                    className="btn-primary mt-6 w-full"
                    disabled={isAccepting || signedInAsOther}
                  >
                    {isAccepting ? 'Joining…' : 'Accept invite'} <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <div className="mt-6 space-y-2">
                  <Link to="/register" state={authState} className="btn-primary w-full">
                    Create an account <ArrowRight size={16} />
                  </Link>
                  <Link to="/login" state={authState} className="btn-secondary w-full">
                    I already have an account
                  </Link>
                  <p className="pt-1 text-center text-xs text-paper-500">
                    Use {invite.email}; you&apos;ll come back here to accept.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AcceptInvite;
