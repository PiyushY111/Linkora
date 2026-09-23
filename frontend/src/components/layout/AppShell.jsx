import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, Link2, BarChart3, Webhook, Terminal, Settings, LogOut } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import useAuthStore from '../../context/authStore';
import { authService } from '../../services';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Links', icon: Link2 },
  { to: '/analytics/all', label: 'Analytics', icon: BarChart3 },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook },
  { to: '/developer', label: 'Developer', icon: Terminal },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const MobileNav = () => {
  const [open, setOpen] = useState(false);
  const { refreshToken, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authService.logout(refreshToken);
    } catch {
      // Best-effort; always clear local state.
    }
    logout();
    navigate('/');
  };

  return (
    <div className="flex h-14 items-center justify-between border-b border-ink-700 bg-ink-950 px-4 lg:hidden">
      <div className="flex items-center gap-2">
        <img src="/logo.svg" alt="" width={24} height={24} />
        <span className="text-sm font-bold text-paper-100">Linkora</span>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-paper-300 hover:bg-ink-800"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-ink-950/80"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-ink-900 p-4"
            >
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-paper-300 hover:bg-ink-800"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
              <nav className="flex-1 space-y-1">
                {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}
                  >
                    <Icon size={17} />
                    {label}
                  </NavLink>
                ))}
              </nav>
              <button type="button" onClick={handleLogout} className="btn-secondary w-full">
                <LogOut size={16} /> Log out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const AppShell = ({ children }) => {
  return (
    <div className="min-h-screen bg-ink-950">
      <Sidebar />
      <MobileNav />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
};

export default AppShell;
