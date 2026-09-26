import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { ArrowRight, ArrowUpRight, KeyRound, AlertTriangle, Mail, Lock, Loader2 } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout';
import AuthField from '../components/auth/AuthField';
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
  const [submitError, setSubmitError] = useState('');
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
    setSubmitError('');

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
        setSubmitError(body?.message || 'Could not sign in. Please check your details and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet><title>Welcome back — Linkora</title></Helmet>
      <AuthLayout>
        <div className="auth-form-heading">
          <span className="auth-heading-icon"><ArrowUpRight size={25} /></span>
          <span className="marketing-eyebrow">PICK UP WHERE YOU LEFT OFF</span>
          <h1>Welcome back.</h1>
          <p>Your links, your people, your next big thing.<br />Sign in to keep the connections going.</p>
        </div>

        {(ssoRequired || callbackError || submitError) && (
          <div className="auth-notice" role="alert">
            <AlertTriangle size={17} />
            <div><p>{ssoRequired?.message ?? callbackError ?? submitError}</p>
              {ssoRequired?.ssoUrl && <button type="button" onClick={() => goToSso(ssoRequired.ssoUrl)} className="marketing-button"><KeyRound size={15} /> Continue with SSO</button>}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" aria-label="Sign in" aria-busy={isLoading}>
          <AuthField id="email" label="Email address" type="email" icon={Mail} placeholder="you@example.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} autoComplete="email" required />
          <AuthField id="password" label="Password" type="password" icon={Lock} placeholder="Enter your password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} autoComplete="current-password" required />
          <button type="submit" className="marketing-button auth-submit" disabled={isLoading}>
            {isLoading ? <><Loader2 size={17} className="auth-spinner" /> Signing in…</> : <>Sign in <ArrowRight size={17} /></>}
          </button>
        </form>

        <div className="auth-divider"><span>or connect with your team</span></div>
        {showSsoEntry ? (
          <form onSubmit={handleStartSso} className="auth-form auth-sso-form" aria-label="Organization single sign-on" aria-busy={isStartingSso}>
            <AuthField id="orgSlug" label="Organization ID" icon={KeyRound} placeholder="your-organization" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} hint="You can find this in your organization’s workspace settings." required autoFocus />
            <button type="submit" className="marketing-button marketing-button--secondary auth-submit" disabled={isStartingSso}>
              {isStartingSso ? <Loader2 size={16} className="auth-spinner" /> : <KeyRound size={16} />}{isStartingSso ? 'Redirecting…' : 'Continue with SSO'}
            </button>
            <button type="button" className="auth-text-button" onClick={() => setShowSsoEntry(false)}>Back to email sign in</button>
          </form>
        ) : <button type="button" onClick={() => setShowSsoEntry(true)} className="marketing-button marketing-button--secondary auth-submit"><KeyRound size={16} /> Sign in with SSO</button>}

        <p className="auth-bottom-link">A new connection starts here. <Link to="/register" state={location.state}>Create an account <ArrowUpRight size={13} /></Link></p>
      </AuthLayout>
    </>
  );
};

export default Login;
