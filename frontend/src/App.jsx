import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';

import useAuthStore from './context/authStore';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import Redirect from './pages/Redirect';

import './styles/globals.css';

function App() {
  const { token } = useAuthStore();

  return (
    <HelmetProvider>
      <Router>
        <Routes>
          <Route path="/" element={!token ? <Landing /> : <Navigate to="/dashboard" />} />
          <Route path="/login" element={!token ? <Login /> : <Navigate to="/dashboard" />} />
          <Route path="/register" element={!token ? <Register /> : <Navigate to="/dashboard" />} />

          <Route path="/dashboard" element={<ProtectedRoute component={Dashboard} />} />
          <Route path="/analytics/:linkId" element={<ProtectedRoute component={Analytics} />} />
          <Route path="/settings" element={<ProtectedRoute component={Settings} />} />

          {/* Catch short links and redirect through backend */}
          <Route path="/:shortCode" element={<Redirect />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
      <Toaster position="top-right" />
    </HelmetProvider>
  );
}

export default App;
