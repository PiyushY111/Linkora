import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, LogOut, Settings, BarChart3, Link as LinkIcon } from 'lucide-react';
import useAuthStore from '../context/authStore';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-gray-900 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 font-bold text-2xl text-blue-600">
            <LinkIcon size={28} />
            Link Manager
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6">
            <Link to="/dashboard" className="hover:text-blue-600 transition">
              Dashboard
            </Link>
            <Link to="/analytics/all" className="hover:text-blue-600 transition">
              Analytics
            </Link>
            <Link to="/settings" className="hover:text-blue-600 transition">
              Settings
            </Link>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-400">{user?.name}</span>
              <button
                onClick={handleLogout}
                className="btn btn-secondary text-sm"
              >
                <LogOut size={16} className="inline mr-2" />
                Logout
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu size={24} />
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden pb-4 flex flex-col gap-3">
            <Link to="/dashboard" className="hover:text-blue-600 transition">
              Dashboard
            </Link>
            <Link to="/analytics/all" className="hover:text-blue-600 transition">
              Analytics
            </Link>
            <Link to="/settings" className="hover:text-blue-600 transition">
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="btn btn-secondary w-full text-left text-sm"
            >
              <LogOut size={16} className="inline mr-2" />
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
