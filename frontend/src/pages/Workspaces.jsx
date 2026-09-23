import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Building2, Plus, UserPlus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { workspaceService } from '../services';
import useAuthStore from '../context/authStore';

const ROLE_ORDER = ['owner', 'admin', 'creator', 'viewer'];

const WorkspaceCard = ({ workspace, onChanged }) => {
  const { user } = useAuthStore();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [isBusy, setIsBusy] = useState(false);

  const myMembership = workspace.members?.find((m) => m.user === user?.id || m.user?._id === user?.id);
  const canManage = myMembership && ['owner', 'admin'].includes(myMembership.role);

  const loadDetail = async () => {
    try {
      const data = await workspaceService.getWorkspace(workspace._id);
      setDetail(data.workspace);
    } catch {
      toast.error('Failed to load workspace');
    }
  };

  const toggleExpand = () => {
    setExpanded((v) => !v);
    if (!expanded && !detail) loadDetail();
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setIsBusy(true);
    try {
      await workspaceService.upsertMember(workspace._id, inviteEmail, inviteRole);
      await loadDetail(); // re-fetch populated member details (mutation response isn't populated)
      setInviteEmail('');
      toast.success('Member added');
      onChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add member');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async (userId) => {
    setIsBusy(true);
    try {
      await workspaceService.removeMember(workspace._id, userId);
      await loadDetail();
      toast.success('Member removed');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove member');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="panel p-5">
      <button type="button" onClick={toggleExpand} className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-800 ring-1 ring-ink-600">
            <Building2 size={16} className="text-paper-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-paper-100">{workspace.name}</p>
            <p className="text-xs text-paper-500">{workspace.organization?.name}</p>
          </div>
        </div>
        <span className="badge-accent capitalize">{myMembership?.role || '—'}</span>
      </button>

      {expanded && (
        <div className="mt-5 border-t border-ink-700 pt-4">
          {!detail ? (
            <Skeleton className="h-24" />
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-paper-500">Members</p>
              <ul className="space-y-1.5">
                {[...detail.members]
                  .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
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
                        <span className="badge-neutral capitalize">{member.role}</span>
                        {canManage && member.role !== 'owner' && (
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

              {canManage && (
                <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    placeholder="teammate@company.com"
                    className="input flex-1"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                  <select className="input sm:w-32" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    <option value="viewer">Viewer</option>
                    <option value="creator">Creator</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button type="submit" className="btn-secondary shrink-0" disabled={isBusy}>
                    <UserPlus size={14} /> Add
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Workspaces = () => {
  const [workspaces, setWorkspaces] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchWorkspaces = async () => {
    setIsLoading(true);
    try {
      const data = await workspaceService.listWorkspaces();
      setWorkspaces(data.workspaces);
    } catch {
      toast.error('Failed to load workspaces');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await workspaceService.createOrganization(orgName);
      toast.success('Organization created');
      setOrgName('');
      setShowCreate(false);
      fetchWorkspaces();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create organization');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Workspaces — Linkora</title>
      </Helmet>
      <AppShell>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-paper-100">Workspaces</h1>
            <p className="mt-1 text-sm text-paper-500">Organizations, teams, and role-based access.</p>
          </div>
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={16} /> New organization
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : workspaces.length > 0 ? (
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <WorkspaceCard key={ws._id} workspace={ws} onChanged={fetchWorkspaces} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Building2}
            title="No workspaces yet"
            description="Create an organization to invite teammates and manage roles."
            action={
              <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
                <Plus size={16} /> New organization
              </button>
            }
          />
        )}
      </AppShell>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New organization">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="orgName">Organization name</label>
            <input
              id="orgName"
              type="text"
              className="input"
              placeholder="Acme Inc"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <p className="text-xs text-paper-500">
            You&apos;ll be added as the workspace owner. A default workspace is created automatically.
          </p>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={isCreating}>
              {isCreating ? 'Creating…' : 'Create'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default Workspaces;
