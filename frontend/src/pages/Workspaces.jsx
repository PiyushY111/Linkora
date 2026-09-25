import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Building2, Plus, UserPlus, Sparkles, ArrowRightLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import WorkspaceCard from '../components/workspaces/WorkspaceCard';
import { workspaceService } from '../services';
import useAuthStore from '../context/authStore';

const Workspaces = () => {
  const { activeWorkspace, switchActiveWorkspace, refreshWorkspaces: refreshAuthWorkspaces } = useAuthStore();
  const [workspaces, setWorkspaces] = useState([]);
  const [roleNames, setRoleNames] = useState({}); // custom role id -> name
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState('organization'); // 'organization' | 'personal'
  const [orgName, setOrgName] = useState('');
  const [wsName, setWsName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingPersonal, setIsCreatingPersonal] = useState(false);

  const fetchWorkspaces = async () => {
    setIsLoading(true);
    try {
      const data = await workspaceService.listWorkspaces();
      setWorkspaces(data.workspaces || []);
      setRoleNames(data.roleNames || {});
      await refreshAuthWorkspaces();
    } catch {
      toast.error('Failed to load workspaces');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, [activeWorkspace?.id]);

  const hasPersonal = workspaces.some(
    (w) => w.name?.toLowerCase() === 'personal' || w.organization?.name?.toLowerCase() === 'personal'
  );

  const handleCreatePersonalDirect = async () => {
    setIsCreatingPersonal(true);
    try {
      const res = await workspaceService.createPersonalWorkspace();
      toast.success('Personal workspace created & activated!');
      if (res.workspace?._id) {
        await switchActiveWorkspace(res.workspace._id);
      }
      await fetchWorkspaces();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create personal workspace');
    } finally {
      setIsCreatingPersonal(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      if (createType === 'personal') {
        const res = await workspaceService.createPersonalWorkspace();
        toast.success('Personal workspace created & activated!');
        if (res.workspace?._id) {
          await switchActiveWorkspace(res.workspace._id);
        }
      } else {
        const res = await workspaceService.createOrganization(orgName.trim(), wsName.trim() || undefined);
        toast.success(`Organization ${orgName} created`);
        if (res.workspace?._id) {
          await switchActiveWorkspace(res.workspace._id);
        }
      }
      setOrgName('');
      setWsName('');
      setShowCreate(false);
      await fetchWorkspaces();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create organization');
    } finally {
      setIsCreating(false);
    }
  };

  const activeWs = workspaces.find((ws) => ws._id === activeWorkspace?.id) || workspaces[0];
  const otherWorkspaces = workspaces.filter((ws) => ws._id !== activeWs?._id);

  return (
    <>
      <Helmet>
        <title>Workspaces — Linkora</title>
      </Helmet>
      <AppShell>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-paper-100">Workspaces</h1>
            <p className="mt-1 text-sm text-paper-500">
              Manage your active workspace, view analytics, team members, and switch organizations.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {!hasPersonal && (
              <button
                type="button"
                onClick={handleCreatePersonalDirect}
                disabled={isCreatingPersonal}
                className="btn-secondary"
              >
                {isCreatingPersonal ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border border-ink-600 border-t-accent-400" />
                ) : (
                  <UserPlus size={15} className="text-accent-400" />
                )}
                <span>Add Personal Workspace</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCreateType('organization');
                setShowCreate(true);
              }}
              className="btn-primary"
            >
              <Plus size={16} />
              <span>New Organization</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : workspaces.length > 0 ? (
          <div className="space-y-8">
            {/* Active Workspace Section */}
            {activeWs && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-accent-400 animate-pulse" />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-paper-400">
                      Active Workspace Details
                    </h2>
                  </div>
                  <span className="text-xs text-paper-500">
                    All created links, webhooks, and analytics are currently scoped here
                  </span>
                </div>
                <WorkspaceCard
                  key={activeWs._id}
                  workspace={activeWs}
                  roleNames={roleNames}
                  isActive={true}
                  onSwitched={fetchWorkspaces}
                />
              </div>
            )}

            {/* Other Workspaces List */}
            {otherWorkspaces.length > 0 && (
              <div className="pt-2 border-t border-ink-800">
                <div className="mb-4">
                  <h2 className="text-base font-bold tracking-tight text-paper-100 flex items-center gap-2">
                    <ArrowRightLeft size={16} className="text-paper-400" />
                    <span>Other Available Workspaces ({otherWorkspaces.length})</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-paper-500">
                    Switch to any of these workspaces to view its scoped links, teams, and analytics.
                  </p>
                </div>
                <div className="space-y-3">
                  {otherWorkspaces.map((ws) => (
                    <WorkspaceCard
                      key={ws._id}
                      workspace={ws}
                      roleNames={roleNames}
                      isActive={false}
                      onSwitched={fetchWorkspaces}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Building2}
            title="No workspaces yet"
            description="Create an organization to invite teammates and manage links collaboratively."
            action={
              <button
                type="button"
                onClick={() => {
                  setCreateType('organization');
                  setShowCreate(true);
                }}
                className="btn-primary"
              >
                <Plus size={16} /> New organization
              </button>
            }
          />
        )}
      </AppShell>

      {/* Create Organization / Personal Workspace Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={createType === 'personal' ? 'Create Personal Workspace' : 'Create New Organization'}
      >
        <div className="mb-4 flex gap-1 rounded-xl border border-ink-700 bg-ink-950 p-1">
          <button
            type="button"
            onClick={() => setCreateType('organization')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              createType === 'organization'
                ? 'bg-ink-800 text-paper-100 shadow'
                : 'text-paper-400 hover:text-paper-200'
            }`}
          >
            Team / Organization
          </button>
          <button
            type="button"
            onClick={() => setCreateType('personal')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              createType === 'personal'
                ? 'bg-ink-800 text-paper-100 shadow'
                : 'text-paper-400 hover:text-paper-200'
            }`}
          >
            Personal Workspace
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {createType === 'organization' ? (
            <>
              <div>
                <label className="field-label" htmlFor="orgName">
                  Organization name *
                </label>
                <input
                  id="orgName"
                  type="text"
                  className="input"
                  placeholder="Acme Corp"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="field-label" htmlFor="wsName">
                  Workspace name <span className="text-paper-500">(Optional)</span>
                </label>
                <input
                  id="wsName"
                  type="text"
                  className="input"
                  placeholder="Main"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-paper-500">
                  Defaults to &quot;Main&quot; if left empty. You can invite team members to this workspace later.
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-accent-400">
                <Sparkles size={16} />
                <span className="text-xs font-semibold text-paper-100">Personal Workspace</span>
              </div>
              <p className="text-xs text-paper-400">
                A private workspace exclusively for your own personal URLs, QR codes, and tracking.
                Teammates from your organizations won&apos;t have access to this workspace.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={isCreating}>
              {isCreating ? 'Creating…' : createType === 'personal' ? 'Create Personal Workspace' : 'Create Organization'}
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
