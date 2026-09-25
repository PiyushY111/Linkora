import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../context/authStore';
import { authService } from '../services';

const ProtectedRoute = ({ component: Component }) => {
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

  // Every page's data (links, analytics, keys, webhooks) is scoped to the
  // active workspace server-side. Keying on it remounts the page after a
  // switch, so it refetches everything and drops per-page state (open
  // drawers, selections) that referred to the previous workspace.
  return <Component key={activeWorkspace?.id ?? 'no-workspace'} />;
};

export default ProtectedRoute;
