import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../context/authStore';
import { authService } from '../services';

const ProtectedRoute = ({ component: Component }) => {
  const { token, user, setUser } = useAuthStore();

  // Zustand state isn't persisted across a hard reload — App's bootstrap
  // exchanges the httpOnly refresh cookie for a token before this route
  // ever mounts, but `user` still needs a fetch. Rehydrate it once per
  // protected page so the sidebar/pages don't show a blank account.
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
