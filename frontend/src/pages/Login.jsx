import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { ArrowRight } from 'lucide-react';
import { authService } from '../services';
import useAuthStore from '../context/authStore';
import { safeRedirectPath } from '../utils/authRedirect';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Set by pages that sent the user here to sign in first (e.g. an invite link).
  const redirectTo = safeRedirectPath(location.state?.from);
  const { setToken, setUser, setActiveWorkspace, refreshWorkspaces } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

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
      toast.error(error.response?.data?.message || 'Login failed');
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
