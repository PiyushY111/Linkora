import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../context/authStore';
import { authService } from '../services';

const ProtectedRoute = ({ component: Component }) => {
  const { token, user, setUser, isBootstrapping } = useAuthStore();

  useEffect(() => {
    if (token && !user) {
      authService.getCurrentUser().then((data) => setUser(data.user)).catch(() => {});
    }
  }, [token, user, setUser]);

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

  return <Component />;
};

export default ProtectedRoute;
