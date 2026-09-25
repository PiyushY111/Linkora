import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { ArrowRight, KeyRound, AlertTriangle } from 'lucide-react';
import { authService } from '../services';
import useAuthStore from '../context/authStore';
import { safeRedirectPath } from '../utils/authRedirect';
import { SSO_ERROR_MESSAGES, isSafeSsoUrl, goToSso } from '../utils/sso';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Set by pages that sent the user here to sign in first (e.g. an invite link).
  const redirectTo = safeRedirectPath(location.state?.from);
  const { setToken, setUser, setActiveWorkspace, refreshWorkspaces } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  // Set when the password was right but the user's organization requires
  // SSO: { message, ssoUrl? }. Shown as a "Continue with SSO" step rather
  // than an automatic redirect, so the switch to the IdP isn't a surprise.
  const [ssoRequired, setSsoRequired] = useState(null);
  const [showSsoEntry, setShowSsoEntry] = useState(false);
  const [orgSlug, setOrgSlug] = useState('');
  const [isStartingSso, setIsStartingSso] = useState(false);
  const callbackError = SSO_ERROR_MESSAGES[new URLSearchParams(location.search).get('error')] ?? null;

  const handleStartSso = async (e) => {
    e.preventDefault();
    setIsStartingSso(true);
    try {
      const data = await authService.startSso(orgSlug.trim());
      if (!goToSso(data.url)) toast.error('Could not start single sign-on');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not start single sign-on');
    } finally {
      setIsStartingSso(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setSsoRequired(null);

    try {
      const data = await authService.login(formData.email, formData.password);
      setToken(data.token);
      setUser(data.user);
      setActiveWorkspace(data.activeWorkspace);
      // Non-blocking: the switcher reloads the list when opened if this fails.
      refreshWorkspaces().catch(() => {});
      toast.success('Welcome back');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const body = error.response?.data;
      if (error.response?.status === 403 && body?.code === 'SSO_REQUIRED') {
        setSsoRequired({ message: body.message, ssoUrl: isSafeSsoUrl(body.ssoUrl) ? body.ssoUrl : null });
      } else {
        toast.error(body?.message || 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Sign in — Linkora</title>
      </Helmet>

      <div className="relative flex min-h-screen items-center justify-center bg-ink-950 bg-grid px-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950 via-transparent to-ink-950" />

        <div className="relative w-full max-w-sm animate-fade-up">
          <Link to="/" className="mb-8 flex items-center justify-center gap-2">
            <img src="/logo.svg" alt="" width={30} height={30} />
            <span className="text-lg font-bold text-paper-100">Linkora</span>
          </Link>

          <div className="panel p-7">
            <h1 className="text-xl font-bold text-paper-100">Sign in</h1>
            <p className="mt-1 text-sm text-paper-500">Welcome back. Enter your details.</p>

            {(ssoRequired || callbackError) && (
              <div className="mt-5 rounded-lg border border-accent-400/25 bg-accent-400/5 p-3" role="status">
                <p className="flex items-start gap-2 text-xs text-paper-200">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-accent-400" />
                  <span>{ssoRequired?.message ?? callbackError}</span>
                </p>
                {ssoRequired?.ssoUrl && (
                  <button type="button" onClick={() => goToSso(ssoRequired.ssoUrl)} className="btn-primary mt-3 w-full">
                    <KeyRound size={15} /> Continue with SSO
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="field-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="you@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="field-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={isLoading}>
                {isLoading ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
              </button>
            </form>

            <div className="mt-5 border-t border-ink-700 pt-4">
              {showSsoEntry ? (
                <form onSubmit={handleStartSso} className="space-y-3">
                  <div>
                    <label className="field-label" htmlFor="orgSlug">Organization</label>
                    <input
                      id="orgSlug"
                      type="text"
                      className="input"
                      placeholder="acme-inc"
                      value={orgSlug}
                      onChange={(e) => setOrgSlug(e.target.value)}
                      required
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-paper-500">Your organization&apos;s ID, as shown to your admin under Workspaces.</p>
                  </div>
                  <button type="submit" className="btn-secondary w-full" disabled={isStartingSso}>
                    <KeyRound size={15} /> {isStartingSso ? 'Redirecting…' : 'Continue with SSO'}
                  </button>
                </form>
              ) : (
                <button type="button" onClick={() => setShowSsoEntry(true)} className="btn-secondary w-full">
                  <KeyRound size={15} /> Sign in with SSO
                </button>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-paper-500">
            Don&apos;t have an account?{' '}
            <Link to="/register" state={location.state} className="font-semibold text-accent-400 hover:text-accent-300">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default Login;
