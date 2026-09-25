import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import useAuthStore from '../context/authStore';
import AppShell from './layout/AppShell';
import EmptyState from './ui/EmptyState';
import { can } from '../utils/permissions';
import { authService } from '../services';

/**
 * @param {{ component: import('react').ComponentType, permission?: string }} props
 *   permission: an action from the workspace permission matrix the page needs.
 *   Without it the page shows a no-access state instead of firing requests
 *   the server would 403 anyway.
 */
const ProtectedRoute = ({ component: Component, permission }) => {
  const { token, user, setUser, setActiveWorkspace, activeWorkspace, isBootstrapping } = useAuthStore();

  useEffect(() => {
    if (token && !user) {
      authService
        .getCurrentUser()
        .then((data) => {
          setUser(data.user);
          if (data.activeWorkspace) setActiveWorkspace(data.activeWorkspace);
        })
        .catch(() => {});
    }
  }, [token, user, setUser, setActiveWorkspace]);

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-accent-400" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !can(activeWorkspace, permission)) {
    return (
      <AppShell>
        <EmptyState
          icon={Lock}
          title="You don't have access to this page"
          description={`Your role in ${activeWorkspace?.name ?? 'this workspace'} (${activeWorkspace?.roleName ?? activeWorkspace?.role ?? 'none'}) can't use this. Ask a workspace admin, or switch workspaces.`}
        />
      </AppShell>
    );
  }

  // Every page's data (links, analytics, keys, webhooks) is scoped to the
  // active workspace server-side. Keying on it remounts the page after a
  // switch, so it refetches everything and drops per-page state (open
  // drawers, selections) that referred to the previous workspace.
  return <Component key={activeWorkspace?.id ?? 'no-workspace'} />;
};

export default ProtectedRoute;
