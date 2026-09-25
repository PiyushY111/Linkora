import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import toast from 'react-hot-toast';
import ActionDropdown from '../ui/ActionDropdown';
import Skeleton from '../ui/Skeleton';
import useAuthStore from '../../context/authStore';
import useLinkStore from '../../context/linkStore';

const MENU_WIDTH = 216;

// A single link's analytics page can't survive a switch: that link belongs
// to the workspace being left.
const SINGLE_LINK_ANALYTICS = /^\/analytics\/(?!all$)[^/]+$/;

function roleIn(workspace, userId) {
  return workspace.members?.find((m) => String(m.user?._id ?? m.user) === String(userId))?.role;
}

/**
 * Shows the active workspace and lets the user switch to any other workspace
 * they belong to. The routed page remounts on a switch (ProtectedRoute keys
 * it by the active workspace), which refetches whatever list is on screen.
 * @param {{ onSwitched?: () => void }} props
 */
export default function WorkspaceSwitcher({ onSwitched }) {
  const { user, activeWorkspace, workspaces, refreshWorkspaces, switchActiveWorkspace } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [switchingTo, setSwitchingTo] = useState(null);

  const userId = user?.id ?? user?._id;

  const handleOpen = async () => {
    setOpen(true);
    // Reload on every open so workspaces joined since sign-in show up.
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
      // Don't flash the previous workspace's links while the page refetches.
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

  if (!activeWorkspace) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-left transition-colors hover:bg-ink-800"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-800 ring-1 ring-ink-600">
          <Building2 size={14} className="text-paper-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-paper-100">{activeWorkspace.name}</p>
          <p className="truncate text-xs capitalize text-paper-500">{activeWorkspace.role}</p>
        </div>
        <ChevronsUpDown size={14} className="shrink-0 text-paper-500" />
      </button>

      <ActionDropdown isOpen={open} onClose={() => setOpen(false)} anchorEl={buttonRef.current} width={MENU_WIDTH}>
        <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-paper-500">Workspaces</p>
        {isLoadingList && workspaces.length === 0 ? (
          <div className="space-y-1.5 px-3 py-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : (
          workspaces.map((workspace) => {
            const isActive = workspace._id === activeWorkspace.id;
            return (
              <button
                key={workspace._id}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(workspace)}
                disabled={switchingTo !== null}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-paper-200 transition-colors hover:bg-ink-750 disabled:opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{workspace.name}</p>
                  <p className="truncate text-paper-500">
                    {workspace.organization?.name}
                    {roleIn(workspace, userId) ? ` · ${roleIn(workspace, userId)}` : ''}
                  </p>
                </div>
                {switchingTo === workspace._id ? (
                  <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-ink-600 border-t-accent-400" />
                ) : (
                  isActive && <Check size={13} className="shrink-0 text-accent-400" />
                )}
              </button>
            );
          })
        )}
        {!isLoadingList && workspaces.length <= 1 && (
          <p className="px-3 pb-2 pt-1 text-xs text-paper-500">
            You&apos;re only a member of this workspace.
          </p>
        )}
      </ActionDropdown>
    </>
  );
}
