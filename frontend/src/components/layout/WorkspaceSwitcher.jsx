import { useRef, useState } from 'react';
import { useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Building2,
  User,
  UserPlus,
  Check,
  ChevronsUpDown,
  Plus,
  Settings,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ActionDropdown from '../ui/ActionDropdown';
import Skeleton from '../ui/Skeleton';
import Modal from '../ui/Modal';
import useAuthStore from '../../context/authStore';
import useLinkStore from '../../context/linkStore';
import { workspaceService } from '../../services';
import { roleLabel } from '../../utils/roles';

const MENU_WIDTH = 270;

// A single link's analytics page can't survive a switch: that link belongs
// to the workspace being left.
const SINGLE_LINK_ANALYTICS = /^\/analytics\/(?!all$)[^/]+$/;

function roleIn(workspace, userId) {
  return workspace.members?.find((m) => String(m.user?._id ?? m.user) === String(userId))?.role;
}

/**
 * WorkspaceSwitcher displayed in the sidebar (and mobile header).
 * Displays the active workspace name clearly, allows 1-click switching between
 * all workspaces, and offers direct options to add a Personal workspace or
 * create a new organization without leaving the current page.
 *
 * @param {{ onSwitched?: () => void }} props
 */
export default function WorkspaceSwitcher({ onSwitched }) {
  const {
    user,
    activeWorkspace,
    workspaces,
    workspaceRoleNames,
    refreshWorkspaces,
    switchActiveWorkspace,
  } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [switchingTo, setSwitchingTo] = useState(null);
  const [isCreatingPersonal, setIsCreatingPersonal] = useState(false);
  const [showNewOrgModal, setShowNewOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newWsName, setNewWsName] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  const userId = user?.id ?? user?._id;

  const handleOpen = async () => {
    setOpen(true);
    setIsLoadingList(true);
    try {
      await refreshWorkspaces();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load workspaces');
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleSelect = async (workspace) => {
    if (workspace._id === activeWorkspace?.id) {
      setOpen(false);
      return;
    }
    setSwitchingTo(workspace._id);
    try {
      await switchActiveWorkspace(workspace._id);
      // Don't flash previous workspace's links while page refetches
      useLinkStore.getState().setLinks([]);
      if (SINGLE_LINK_ANALYTICS.test(location.pathname)) {
        navigate('/analytics/all', { replace: true });
      }
      setOpen(false);
      onSwitched?.();
      toast.success(`Switched to ${workspace.name}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to switch workspace');
    } finally {
      setSwitchingTo(null);
    }
  };

  // 1-click add Personal Workspace directly from dropdown
  const handleAddPersonal = async () => {
    setIsCreatingPersonal(true);
    try {
      const res = await workspaceService.createPersonalWorkspace();
      await refreshWorkspaces();
      if (res.workspace?._id) {
        await switchActiveWorkspace(res.workspace._id);
      }
      setOpen(false);
      onSwitched?.();
      toast.success('Personal workspace created & activated!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create personal workspace');
    } finally {
      setIsCreatingPersonal(false);
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setIsCreatingOrg(true);
    try {
      const res = await workspaceService.createOrganization(newOrgName.trim(), newWsName.trim() || undefined);
      await refreshWorkspaces();
      if (res.workspace?._id) {
        await switchActiveWorkspace(res.workspace._id);
      }
      setShowNewOrgModal(false);
      setNewOrgName('');
      setNewWsName('');
      setOpen(false);
      onSwitched?.();
      toast.success(`Organization ${newOrgName} created & active`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create organization');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  if (!activeWorkspace) return null;

  const isActivePersonal =
    activeWorkspace.name?.toLowerCase() === 'personal' ||
    activeWorkspace.roleName?.toLowerCase() === 'personal';

  const hasPersonal = workspaces.some(
    (w) => w.name?.toLowerCase() === 'personal' || w.organization?.name?.toLowerCase() === 'personal'
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center gap-2.5 rounded-xl border border-ink-700 bg-ink-900/90 px-3 py-2.5 text-left transition-all hover:border-ink-600 hover:bg-ink-850 group focus:outline-none focus:ring-1 focus:ring-accent-400/40"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Active Workspace: ${activeWorkspace.name}`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors ${
            isActivePersonal
              ? 'bg-accent-400/15 text-accent-400 ring-accent-400/30'
              : 'bg-ink-800 text-paper-200 ring-ink-600 group-hover:text-accent-400'
          }`}
        >
          {isActivePersonal ? <User size={16} /> : <Building2 size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          {/* Workspace name clearly visible and emphasized */}
          <p className="truncate text-sm font-bold tracking-tight text-paper-100 group-hover:text-white">
            {activeWorkspace.name}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-paper-400">
            <span className="capitalize">{activeWorkspace.roleName ?? activeWorkspace.role}</span>
          </div>
        </div>
        <ChevronsUpDown size={15} className="shrink-0 text-paper-500 group-hover:text-paper-300 transition-colors" />
      </button>

      <ActionDropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        anchorEl={buttonRef.current}
        width={MENU_WIDTH}
        align="left"
      >
        {/* Dropdown Header */}
        <div className="border-b border-ink-800 px-3 py-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-paper-400">
            Switch Workspace
          </p>
          <span className="flex items-center gap-1 text-[10px] text-accent-400 font-medium bg-accent-400/10 px-2 py-0.5 rounded-full border border-accent-400/20">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse" />
            Active
          </span>
        </div>

        {/* Workspace List */}
        <div className="max-h-60 overflow-y-auto py-1">
          {isLoadingList && workspaces.length === 0 ? (
            <div className="space-y-1.5 px-3 py-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : (
            workspaces.map((workspace) => {
              const isActive = workspace._id === activeWorkspace.id;
              const isWsPersonal =
                workspace.name?.toLowerCase() === 'personal' ||
                workspace.organization?.name?.toLowerCase() === 'personal';

              return (
                <button
                  key={workspace._id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelect(workspace)}
                  disabled={switchingTo !== null}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-accent-400/10 text-paper-100 font-semibold'
                      : 'text-paper-200 hover:bg-ink-750'
                  } disabled:opacity-60`}
                >
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                      isActive ? 'bg-accent-400 text-ink-950 font-bold' : 'bg-ink-800 text-paper-400'
                    }`}
                  >
                    {isWsPersonal ? <User size={12} /> : <Building2 size={12} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate ${isActive ? 'font-bold text-accent-400' : 'font-medium text-paper-100'}`}>
                      {workspace.name}
                    </p>
                    <p className="truncate text-[11px] text-paper-500">
                      {workspace.organization?.name}
                      {roleIn(workspace, userId) ? ` · ${roleLabel(roleIn(workspace, userId), workspaceRoleNames)}` : ''}
                    </p>
                  </div>
                  {switchingTo === workspace._id ? (
                    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-ink-600 border-t-accent-400" />
                  ) : (
                    isActive && <Check size={14} className="shrink-0 text-accent-400 font-bold" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Action Options: Add Personal Workspace & New Organization */}
        <div className="border-t border-ink-800 p-1.5 space-y-1">
          {!hasPersonal && (
            <button
              type="button"
              onClick={handleAddPersonal}
              disabled={isCreatingPersonal}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-accent-400 hover:bg-accent-400/10 transition-colors disabled:opacity-50 text-left"
            >
              {isCreatingPersonal ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border border-ink-600 border-t-accent-400" />
              ) : (
                <UserPlus size={14} />
              )}
              <span className="truncate">Add Personal Workspace</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowNewOrgModal(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-paper-300 hover:bg-ink-750 hover:text-paper-100 transition-colors text-left"
          >
            <Plus size={14} className="text-paper-400" />
            <span className="truncate">New Organization / Team</span>
          </button>

          <RouterLink
            to="/workspaces"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-paper-400 hover:bg-ink-750 hover:text-paper-200 transition-colors"
          >
            <Settings size={14} className="text-paper-500" />
            <span className="truncate">Manage All Workspaces</span>
          </RouterLink>
        </div>
      </ActionDropdown>

      {/* Quick Modal: Create Organization right from switcher */}
      <Modal
        open={showNewOrgModal}
        onClose={() => setShowNewOrgModal(false)}
        title="Create New Organization"
      >
        <form onSubmit={handleCreateOrg} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="newOrgName">
              Organization Name *
            </label>
            <input
              id="newOrgName"
              type="text"
              className="input"
              placeholder="e.g. Acme Corp"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="field-label" htmlFor="newWsName">
              Workspace Name <span className="text-paper-500">(Optional)</span>
            </label>
            <input
              id="newWsName"
              type="text"
              className="input"
              placeholder="Main"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-paper-500">
              Defaults to &quot;Main&quot; if left empty. You can invite teammates after creation.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={isCreatingOrg}>
              {isCreatingOrg ? 'Creating…' : 'Create & Switch'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowNewOrgModal(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
