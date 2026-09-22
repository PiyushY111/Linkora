import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

const Redirect = () => {
  const { shortCode } = useParams();

  useEffect(() => {
    // Case-sensitive: hand off to the backend redirect endpoint exactly as
    // typed. The API layer owns cache lookup, password/expiry checks, and
    // click tracking.
    if (shortCode) {
      window.location.href = `/api/r/${shortCode}`;
    }
  }, [shortCode]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-accent-400" />
      <p className="font-mono text-xs text-paper-500">Redirecting…</p>
    </div>
  );
};

export default Redirect;
