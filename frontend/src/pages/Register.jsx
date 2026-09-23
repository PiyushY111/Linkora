import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { ArrowRight } from 'lucide-react';
import { authService } from '../services';
import useAuthStore from '../context/authStore';

const Register = () => {
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const data = await authService.register(formData.name, formData.email, formData.password);
      setToken(data.token);
      setUser(data.user);
      toast.success('Account created');
      navigate('/dashboard');
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
            <Link to="/login" className="font-semibold text-accent-400 hover:text-accent-300">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default Register;
