import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { ArrowRight, ArrowUpRight, AlertTriangle, User, Building2, Mail, Loader2, Check } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout';
import AuthField from '../components/auth/AuthField';
import { authService } from '../services';
import useAuthStore from '../context/authStore';
import { safeRedirectPath } from '../utils/authRedirect';

const ACCOUNT_TYPES = [
  { value: 'personal', label: 'Just for me', description: 'My links, my space', icon: User },
  { value: 'organization', label: 'With my team', description: 'Better, together', icon: Building2 },
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
  const [submitError, setSubmitError] = useState('');
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
    setSubmitError('');

    if (formData.password !== formData.confirmPassword) {
      setSubmitError('Your passwords don’t match. Please try again.');
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
      setSubmitError(error.response?.data?.message || 'Could not create your account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet><title>Create your account — Linkora</title></Helmet>
      <AuthLayout register>
        <div className="auth-form-heading">
          <span className="auth-heading-icon"><ArrowUpRight size={25} /></span>
          <span className="marketing-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>Small link. Big start.</h1>
          <p>Create your account. Make your first connection.</p>
        </div>

        {submitError && <div className="auth-notice" role="alert"><AlertTriangle size={17} /><p>{submitError}</p></div>}
        <form onSubmit={handleSubmit} className="auth-form" aria-label="Create an account" aria-busy={isLoading}>
          <fieldset className="auth-account-fieldset">
            <legend>How will you use Linkora?</legend>
            <div className="auth-account-options">
              {ACCOUNT_TYPES.map(({ value, label, description, icon: Icon }) => (
                <label key={value} className={`auth-account-option${accountType === value ? ' is-selected' : ''}`}>
                  <input type="radio" name="accountType" value={value} checked={accountType === value} onChange={() => setAccountType(value)} />
                  <Icon size={19} aria-hidden="true" /><span>{label}<small>{description}</small></span><span className="auth-radio-indicator">{accountType === value && <Check size={10} />}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <AuthField id="name" label="Full name" icon={User} placeholder="Your name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} autoComplete="name" maxLength={50} required />
          {isOrganization && <div>
            <AuthField id="organizationName" label="Organization name" icon={Building2} placeholder="Your team or company" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} onBlur={() => setOrgNameTouched(true)} autoComplete="organization" maxLength={ORG_NAME_MAX} aria-invalid={Boolean(orgNameTouched && orgNameError)} aria-describedby={orgNameTouched && orgNameError ? 'organizationNameError' : undefined} required />
            {orgNameTouched && orgNameError && <p id="organizationNameError" className="auth-field-error"><AlertTriangle size={12} />{orgNameError}</p>}
          </div>}
          <AuthField id="email" label="Email address" type="email" icon={Mail} placeholder="you@example.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} autoComplete="email" required />
          <div className="auth-password-row">
            <AuthField id="password" label="Password" type="password" placeholder="Create a password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} hint="At least 6 characters" autoComplete="new-password" minLength={6} required />
            <AuthField id="confirmPassword" label="Confirm password" type="password" placeholder="Repeat password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} autoComplete="new-password" minLength={6} required />
          </div>
          <button type="submit" className="marketing-button auth-submit" disabled={isLoading}>
            {isLoading ? <><Loader2 size={17} className="auth-spinner" /> Creating your account…</> : <>Create your account <ArrowRight size={17} /></>}
          </button>
          <p className="auth-signup-note"><Check size={13} /> No credit card needed. Just a little possibility.</p>
        </form>
        <p className="auth-bottom-link">Already part of the picture? <Link to="/login" state={location.state}>Sign in <ArrowUpRight size={13} /></Link></p>
      </AuthLayout>
    </>
  );
};

export default Register;
