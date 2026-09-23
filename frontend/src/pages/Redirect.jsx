import { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Lock, ArrowRight, Eye, EyeOff, ShieldAlert, AlertTriangle, Home, Sparkles, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';

export default function Redirect() {
  const { shortCode } = useParams();

  // State: 'checking' | 'password_prompt' | 'redirecting' | 'error' | 'expired' | 'not_found'
  const [state, setState] = useState('checking');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!shortCode) return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('limit') === '1') {
      setState('limit_reached');
      return;
    }
    checkLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortCode]);

  const checkLink = async () => {
    try {
      const res = await axios.get(`/api/r/${shortCode}?probe=1`);
      if (res.data?.success) {
        // Link does not require password, proceed with actual redirect
        setState('redirecting');
        window.location.href = `/api/r/${shortCode}`;
      }
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (data?.limitReached) {
        setState('limit_reached');
      } else if (status === 403) {
        setState('password_prompt');
      } else if (status === 410) {
        setState('expired');
      } else if (status === 404) {
        setState('not_found');
      } else {
        // Fallback: try direct redirect anyway
        window.location.href = `/api/r/${shortCode}`;
      }
    }
  };

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage('Please enter the password');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await axios.get(
        `/api/r/${shortCode}?probe=1&pwd=${encodeURIComponent(password.trim())}`
      );
      if (res.data?.success) {
        setState('redirecting');
        // Full browser navigation with password param to trigger 307 redirect and click tracking
        window.location.href = `/api/r/${shortCode}?pwd=${encodeURIComponent(password.trim())}`;
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setErrorMessage('Incorrect password. Please try again.');
      } else {
        setErrorMessage(err.response?.data?.message || 'Verification failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Checking / Redirecting Loader
  if (state === 'checking' || state === 'redirecting') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-950 px-4">
        <div className="relative flex h-12 w-12 items-center justify-center">
          <div className="absolute h-full w-full animate-ping rounded-full bg-accent-400/20" />
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-accent-400" />
        </div>
        <p className="font-mono text-xs text-paper-400">
          {state === 'redirecting' ? 'Redirecting to destination…' : 'Connecting to Linkora…'}
        </p>
      </div>
    );
  }

  // 2. Password Prompt Screen
  if (state === 'password_prompt') {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-ink-950 px-4 py-12">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <div className="pointer-events-none absolute h-96 w-96 rounded-full bg-accent-400/5 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="relative z-10 w-full max-w-md rounded-2xl border border-ink-600 bg-ink-900/95 p-7 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-400/30 bg-accent-400/10 text-accent-400 shadow-glow">
              <Lock size={26} />
            </div>

            <h1 className="mt-4 text-xl font-bold text-paper-100">
              Password Protected Link
            </h1>
            <p className="mt-1.5 font-mono text-xs text-accent-400">
              /{shortCode}
            </p>
            <p className="mt-2 text-xs text-paper-500">
              The owner of this link has protected it with a password. Enter the password below to continue.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="mt-6 space-y-4">
            <div>
              <label className="field-label" htmlFor="linkPassword">
                Link Password
              </label>
              <div className="relative">
                <input
                  id="linkPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  placeholder="Enter link password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  className={`input pr-10 font-mono ${
                    errorMessage ? 'border-danger focus:border-danger focus:ring-danger/20' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-500 hover:text-paper-200"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {errorMessage && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1.5 flex items-center gap-1 text-xs text-danger"
                >
                  <AlertTriangle size={12} />
                  <span>{errorMessage}</span>
                </motion.p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className="btn-primary w-full py-3"
            >
              {isSubmitting ? (
                <span>Verifying…</span>
              ) : (
                <>
                  <span>Unlock & Continue</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-ink-800 pt-4 text-center">
            <p className="text-[11px] text-paper-500">
              Secured with bcrypt cryptographic authentication by Linkora
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Click Limit Reached State
  if (state === 'limit_reached') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
        <div className="panel max-w-md p-8 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10 text-warning ring-1 ring-warning/30">
            <Users size={24} />
          </div>
          <h2 className="text-xl font-bold text-paper-100">Click Limit Reached</h2>
          <p className="text-xs text-paper-500">
            This shortened link (<span className="font-mono text-paper-300">/{shortCode}</span>) was configured with a maximum usage limit and has reached its allowed number of opens.
          </p>
          <RouterLink to="/" className="btn-secondary btn-sm inline-flex items-center gap-1.5 mt-2">
            <Home size={14} />
            <span>Go to Linkora</span>
          </RouterLink>
        </div>
      </div>
    );
  }

  // 3. Expired / Disabled State
  if (state === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
        <div className="panel max-w-md p-8 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger ring-1 ring-danger/30">
            <ShieldAlert size={24} />
          </div>
          <h2 className="text-xl font-bold text-paper-100">Link No Longer Available</h2>
          <p className="text-xs text-paper-500">
            This shortened link (<span className="font-mono text-paper-300">/{shortCode}</span>) has either expired or been disabled by its owner.
          </p>
          <RouterLink to="/" className="btn-secondary btn-sm inline-flex items-center gap-1.5 mt-2">
            <Home size={14} />
            <span>Go to Linkora</span>
          </RouterLink>
        </div>
      </div>
    );
  }

  // 4. Not Found (404)
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="panel max-w-md p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 text-paper-400 ring-1 ring-ink-700">
          <AlertTriangle size={24} />
        </div>
        <h2 className="text-xl font-bold text-paper-100">Link Not Found</h2>
        <p className="text-xs text-paper-500">
          The requested short code <span className="font-mono text-accent-400">/{shortCode}</span> does not exist in our routing directory.
        </p>
        <RouterLink to="/" className="btn-secondary btn-sm inline-flex items-center gap-1.5 mt-2">
          <Home size={14} />
          <span>Go to Homepage</span>
        </RouterLink>
      </div>
    </div>
  );
}
