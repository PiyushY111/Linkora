import { NavLink, useNavigate } from 'react-router-dom';
import { Link2, BarChart3, QrCode, Webhook, Terminal, Building2, Settings, LogOut } from 'lucide-react';
import useAuthStore from '../../context/authStore';
import { authService } from '../../services';
import WorkspaceSwitcher from './WorkspaceSwitcher';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Links', icon: Link2 },
  { to: '/qr-codes', label: 'QR Studio', icon: QrCode },
  { to: '/analytics/all', label: 'Analytics', icon: BarChart3 },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook },
  { to: '/developer', label: 'Developer', icon: Terminal },
  { to: '/workspaces', label: 'Workspaces', icon: Building2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const Sidebar = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // Best-effort server-side revocation; always clear local state.
    }
    logout();
    navigate('/');
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-ink-700 bg-ink-950 lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <img src="/logo.svg" alt="" width={28} height={28} />
        <span className="text-base font-bold tracking-tight text-paper-100">Linkora</span>
      </div>

      <div className="px-3 pb-2">
        <WorkspaceSwitcher />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-700 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-400/15 text-sm font-semibold text-accent-400 ring-1 ring-accent-400/25">
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-paper-100">{user?.name || 'Account'}</p>
            <p className="truncate text-xs text-paper-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-1.5 text-paper-500 transition-colors hover:bg-ink-800 hover:text-danger"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
