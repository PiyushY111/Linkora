import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';

import useAuthStore from './context/authStore';
import { bootstrapSession } from './services/api';
import ProtectedRoute from './components/ProtectedRoute';
import { safeRedirectPath } from './utils/authRedirect';

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
import PublicBioPage from './pages/PublicBioPage';
import BioPageBuilder from './pages/BioPageBuilder';
import Workspaces from './pages/Workspaces';
import AcceptInvite from './pages/AcceptInvite';
import OnboardingInviteTeam from './pages/OnboardingInviteTeam';

import { ConfirmProvider } from './context/ConfirmContext';
import './styles/globals.css';

// Login/register for signed-out users only. Someone already signed in when
// they arrive goes wherever the sending page asked (router state `from`),
// else the dashboard. When they sign in *on* the page, the page navigates
// itself (register may send a new team to onboarding), so this doesn't race
// it with a redirect of its own.
function GuestRoute({ children }) {
  const location = useLocation();
  const [signedInOnArrival] = useState(() => Boolean(useAuthStore.getState().token));
  return signedInOnArrival ? <Navigate to={safeRedirectPath(location.state?.from)} replace /> : children;
}

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
            <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
            {/* Public: an invitee may not have an account yet. */}
            <Route path="/invite/:token" element={<AcceptInvite />} />

            <Route path="/dashboard" element={<ProtectedRoute component={Dashboard} />} />
            <Route path="/qr-codes" element={<ProtectedRoute component={QRCodeStudio} />} />
            <Route path="/bio" element={<ProtectedRoute component={BioPageBuilder} permission="links:read" />} />
            <Route path="/analytics" element={<Navigate to="/analytics/all" replace />} />
            <Route path="/analytics/:linkId" element={<ProtectedRoute component={Analytics} />} />
            <Route path="/workspaces" element={<ProtectedRoute component={Workspaces} />} />
            <Route path="/onboarding/invite-team" element={<ProtectedRoute component={OnboardingInviteTeam} />} />
            <Route path="/webhooks" element={<ProtectedRoute component={Webhooks} permission="webhooks:manage" />} />
            <Route path="/developer" element={<ProtectedRoute component={Developer} permission="apiKeys:manage" />} />
            <Route path="/settings" element={<ProtectedRoute component={Settings} />} />

            {/* Public link-in-bio pages; the frontend host proxies the first
                load to the API so link previews get real meta tags. */}
            <Route path="/b/:slug" element={<PublicBioPage />} />

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
