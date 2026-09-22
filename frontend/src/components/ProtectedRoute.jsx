import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../context/authStore';
import { authService } from '../services';

const ProtectedRoute = ({ component: Component }) => {
  const { token, user, setUser } = useAuthStore();

  // Zustand state isn't persisted across a hard reload/direct navigation —
  // only the tokens are (localStorage). Rehydrate the user once per
  // protected page so the sidebar/pages don't show a blank account on
  // refresh or on any route other than the one that originally fetched it.
  useEffect(() => {
    if (token && !user) {
      authService.getCurrentUser().then((data) => setUser(data.user)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Component />;
};

export default ProtectedRoute;
