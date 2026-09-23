import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';

import useAuthStore from './context/authStore';
import { bootstrapSession } from './services/api';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Webhooks from './pages/Webhooks';
import Developer from './pages/Developer';
import Settings from './pages/Settings';
import QRCodeStudio from './pages/QRCodeStudio';
import NotFound from './pages/NotFound';
import Redirect from './pages/Redirect';

import { ConfirmProvider } from './context/ConfirmContext';
import './styles/globals.css';

function App() {
  const { token, isBootstrapping } = useAuthStore();

  // Exchange the httpOnly refresh cookie (if any) for an in-memory access
  // token before any route renders, so a hard refresh doesn't briefly look
  // logged-out while that exchange is in flight.
  useEffect(() => {
    bootstrapSession();
  }, []);

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-accent-400" />
      </div>
    );
  }

  return (
    <HelmetProvider>
      <ConfirmProvider>
        <Router>
          <Routes>
            <Route path="/" element={!token ? <Landing /> : <Navigate to="/dashboard" />} />
            <Route path="/login" element={!token ? <Login /> : <Navigate to="/dashboard" />} />
            <Route path="/register" element={!token ? <Register /> : <Navigate to="/dashboard" />} />

            <Route path="/dashboard" element={<ProtectedRoute component={Dashboard} />} />
            <Route path="/qr-codes" element={<ProtectedRoute component={QRCodeStudio} />} />
            <Route path="/analytics" element={<Navigate to="/analytics/all" replace />} />
            <Route path="/analytics/:linkId" element={<ProtectedRoute component={Analytics} />} />
            <Route path="/workspaces" element={<Navigate to="/dashboard" replace />} />
            <Route path="/webhooks" element={<ProtectedRoute component={Webhooks} />} />
            <Route path="/developer" element={<ProtectedRoute component={Developer} />} />
            <Route path="/settings" element={<ProtectedRoute component={Settings} />} />

            {/* Catch short links and redirect through backend */}
            <Route path="/:shortCode" element={<Redirect />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#18181B',
              color: '#F5F5F7',
              border: '1px solid #2B2B30',
              fontSize: '0.875rem',
            },
            success: { iconTheme: { primary: '#C6FF3D', secondary: '#0A0A0B' } },
            error: { iconTheme: { primary: '#FF5C5C', secondary: '#0A0A0B' } },
          }}
        />
      </ConfirmProvider>
    </HelmetProvider>
  );
}

export default App;
