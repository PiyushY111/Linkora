import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { ArrowRight, AlertTriangle, User, Building2 } from 'lucide-react';
import { authService } from '../services';
import useAuthStore from '../context/authStore';
import { safeRedirectPath } from '../utils/authRedirect';

const ACCOUNT_TYPES = [
  { value: 'personal', label: 'Just for me', icon: User },
  { value: 'organization', label: 'My team / company', icon: Building2 },
];
const ORG_NAME_MIN = 2;
const ORG_NAME_MAX = 100;

/** Same rule the server applies; null when valid. */
function organizationNameError(value) {
  const length = value.trim().length;
  if (length === 0) return 'Organization name is required';
  if (length < ORG_NAME_MIN || length > ORG_NAME_MAX) {
    return `Organization name must be ${ORG_NAME_MIN}-${ORG_NAME_MAX} characters`;
  }
  return null;
}

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setToken, setUser, setActiveWorkspace, refreshWorkspaces } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [accountType, setAccountType] = useState('personal');
  const [organizationName, setOrganizationName] = useState('');
  const [orgNameTouched, setOrgNameTouched] = useState(false);
  const isOrganization = accountType === 'organization';
  const orgNameError = isOrganization ? organizationNameError(organizationName) : null;
  const [formData, setFormData] = useState({
    name: '',
    email: typeof location.state?.email === 'string' ? location.state.email : '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (orgNameError) {
      setOrgNameTouched(true);
      return;
    }

    setIsLoading(true);

    try {
      const data = await authService.register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        accountType,
        organizationName: isOrganization ? organizationName.trim() : undefined,
      });
      setToken(data.token);
      setUser(data.user);
      setActiveWorkspace(data.activeWorkspace);
      // Non-blocking: the switcher reloads the list when opened if this fails.
      refreshWorkspaces().catch(() => {});
      toast.success('Account created');
      // A page that sent the user here (e.g. an invite link) takes priority;
      // otherwise a new team goes on to invite people, a personal account
      // to the dashboard as before.
      const from = location.state?.from;
      const next = from ? safeRedirectPath(from) : isOrganization ? '/onboarding/invite-team' : '/dashboard';
      navigate(next, { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Create account — Linkora</title>
      </Helmet>

      <div className="relative flex min-h-screen items-center justify-center bg-ink-950 bg-grid px-4 py-10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950 via-transparent to-ink-950" />

        <div className="relative w-full max-w-sm animate-fade-up">
          <Link to="/" className="mb-8 flex items-center justify-center gap-2">
            <img src="/logo.svg" alt="" width={30} height={30} />
            <span className="text-lg font-bold text-paper-100">Linkora</span>
          </Link>

          <div className="panel p-7">
            <h1 className="text-xl font-bold text-paper-100">Create your account</h1>
            <p className="mt-1 text-sm text-paper-500">Start shortening in under a minute.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="field-label" htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  className="input"
                  placeholder="Ada Lovelace"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div>
                <span className="field-label" id="accountTypeLabel">Account</span>
                <div
                  role="radiogroup"
                  aria-labelledby="accountTypeLabel"
                  className="grid grid-cols-2 gap-1 rounded-lg border border-ink-700 bg-ink-950 p-0.5"
                >
                  {ACCOUNT_TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={accountType === value}
                      onClick={() => setAccountType(value)}
                      className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                        accountType === value ? 'bg-ink-800 text-paper-100 shadow-sm' : 'text-paper-400 hover:text-paper-200'
                      }`}
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {isOrganization && (
                <div>
                  <label className="field-label" htmlFor="organizationName">Organization name</label>
                  <input
                    id="organizationName"
                    type="text"
                    className="input"
                    placeholder="Acme Inc"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    onBlur={() => setOrgNameTouched(true)}
                    maxLength={ORG_NAME_MAX}
                    aria-invalid={Boolean(orgNameTouched && orgNameError)}
                    aria-describedby={orgNameTouched && orgNameError ? 'organizationNameError' : undefined}
                    required
                  />
                  {orgNameTouched && orgNameError && (
                    <p id="organizationNameError" className="mt-1.5 flex items-center gap-1 text-xs text-danger">
                      <AlertTriangle size={12} />
                      <span>{orgNameError}</span>
                    </p>
                  )}
                </div>
              )}

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
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="field-label" htmlFor="confirmPassword">Confirm</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary w-full" disabled={isLoading}>
                {isLoading ? 'Creating account…' : 'Create account'} <ArrowRight size={16} />
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-paper-500">
            Already have an account?{' '}
            <Link to="/login" state={location.state} className="font-semibold text-accent-400 hover:text-accent-300">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default Register;
