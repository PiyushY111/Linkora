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
        className="panel-elevated group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:border-ink-500 hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Active Workspace: ${activeWorkspace.name}`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-paper-300 ring-1 ring-ink-600 transition-colors duration-150 group-hover:text-paper-100">
          {isActivePersonal ? <User size={16} /> : <Building2 size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-paper-100">
            {activeWorkspace.name}
          </p>
          <p className="truncate text-xs capitalize text-paper-500">
            {activeWorkspace.roleName ?? activeWorkspace.role}
          </p>
        </div>
        <ChevronsUpDown size={15} className="shrink-0 text-paper-500 transition-colors duration-150 group-hover:text-paper-300" />
      </button>

      <ActionDropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        anchorEl={buttonRef.current}
        width={MENU_WIDTH}
        align="left"
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-3.5 pb-2.5 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-paper-500">
            Switch Workspace
          </p>
          <span className="flex items-center gap-1.5 rounded-full bg-ink-900 px-2 py-0.5 text-[10px] font-medium text-paper-300 ring-1 ring-inset ring-ink-600">
            <span className="h-1.5 w-1.5 rounded-full bg-paper-300" />
            Active
          </span>
        </div>

        <div className="max-h-60 space-y-0.5 overflow-y-auto p-1.5">
          {isLoadingList && workspaces.length === 0 ? (
            <div className="space-y-1.5 px-1.5 py-1">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
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
                  className={`relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 disabled:opacity-60 ${
                    isActive ? 'bg-ink-700 text-paper-100' : 'text-paper-300 hover:bg-ink-700 hover:text-paper-100'
                  }`}
                >
                  {isActive && (
                    <span aria-hidden="true" className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-400" />
                  )}
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ${
                      isActive ? 'bg-ink-600 text-paper-100 ring-ink-500' : 'bg-ink-900 text-paper-500 ring-ink-600'
                    }`}
                  >
                    {isWsPersonal ? <User size={13} /> : <Building2 size={13} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-paper-100 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                      {workspace.name}
                    </p>
                    <p className="truncate text-[11px] text-paper-500">
                      {workspace.organization?.name}
                      {roleIn(workspace, userId) ? ` · ${roleLabel(roleIn(workspace, userId), workspaceRoleNames)}` : ''}
                    </p>
                  </div>
                  {switchingTo === workspace._id ? (
                    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-ink-600 border-t-paper-300" />
                  ) : (
                    isActive && <Check size={14} className="shrink-0 text-paper-100" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="space-y-0.5 border-t border-ink-700 p-1.5">
          {!hasPersonal && (
            <button
              type="button"
              onClick={handleAddPersonal}
              disabled={isCreatingPersonal}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-paper-300 transition-colors duration-150 hover:bg-ink-700 hover:text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 disabled:opacity-50"
            >
              {isCreatingPersonal ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border border-ink-600 border-t-paper-300" />
              ) : (
                <UserPlus size={14} className="text-paper-500" />
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
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-paper-300 transition-colors duration-150 hover:bg-ink-700 hover:text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-500"
          >
            <Plus size={14} className="text-paper-500" />
            <span className="truncate">New Organization / Team</span>
          </button>

          <RouterLink
            to="/workspaces"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-paper-300 transition-colors duration-150 hover:bg-ink-700 hover:text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-500"
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
