import React from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../context/authStore';

const ProtectedRoute = ({ component: Component }) => {
  const { token, user } = useAuthStore();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Component />;
};

export default ProtectedRoute;
