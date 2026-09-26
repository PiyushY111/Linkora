import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import useAuthStore from '../../context/authStore';
import { can } from '../../utils/permissions';
import { authService } from '../../services';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import AppBrand from './AppBrand';
import { NAV_ITEMS } from './navItems';

/**
 * Brand, workspace switcher, nav and account row. Rendered by the desktop
 * sidebar and by the mobile slide-over in AppShell.
 *
 * @param {{ onNavigate?: () => void, headerAction?: import('react').ReactNode }} props
 *   onNavigate: called after the brand, a nav link, or a workspace switch is used.
 *   headerAction: rendered at the right of the brand row (the mobile close button).
 */
export const SidebarContent = ({ onNavigate, headerAction }) => {
  const { user, activeWorkspace, logout } = useAuthStore();
  const navItems = NAV_ITEMS.filter((item) => !item.permission || can(activeWorkspace, item.permission));
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
        <AppBrand onNavigate={onNavigate} />
        {headerAction}
      </div>

      <div className="px-3 pb-3">
        <WorkspaceSwitcher onSwitched={onNavigate} />
      </div>

      <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-ink-700 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-paper-100 ring-1 ring-ink-600">
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-paper-100">{user?.name || 'Account'}</p>
            <p className="truncate text-xs text-paper-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-1.5 text-paper-500 transition-colors duration-150 hover:bg-ink-800 hover:text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-500"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

const Sidebar = () => (
  <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-ink-700 bg-ink-950 lg:flex">
    <SidebarContent />
  </aside>
);

export default Sidebar;
