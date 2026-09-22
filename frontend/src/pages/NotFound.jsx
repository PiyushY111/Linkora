import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

const NotFound = () => {
  return (
    <>
      <Helmet>
        <title>Page not found — Linkly</title>
      </Helmet>

      <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 bg-grid px-4 text-center">
        <p className="font-mono text-sm text-accent-400">404</p>
        <h1 className="mt-3 text-3xl font-bold text-paper-100">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm text-paper-500">
          The page you&apos;re looking for doesn&apos;t exist, or the link has been moved.
        </p>
        <div className="mt-7 flex gap-3">
          <Link to="/" className="btn-primary">Go home</Link>
          <Link to="/dashboard" className="btn-secondary">Dashboard</Link>
        </div>
      </div>
    </>
  );
};

export default NotFound;
