import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, Laptop } from 'lucide-react';

/** Change password, and the current browser session with sign-out. */
export default function SecurityTab({ form, logout }) {
  const { currentPassword, setCurrentPassword, newPassword, setNewPassword, confirmPassword, setConfirmPassword, showCurrentPass, setShowCurrentPass, showNewPass, setShowNewPass, isUpdatingPassword, handleChangePassword } = form;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl"
    >
      {/* Change Password Card */}
      <div className="panel p-6">
        <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
          <Lock size={18} className="text-accent-400" />
          <span>Change Password</span>
        </h2>
        <p className="mt-1 text-xs text-paper-500">
          Update your account password. Requires your existing password for verification.
        </p>

        <form onSubmit={handleChangePassword} className="mt-5 space-y-4 max-w-lg">
          <div>
            <label className="field-label" htmlFor="current-password">
              Current Password
            </label>
            <div className="relative">
              <input
                id="current-password"
                type={showCurrentPass ? 'text' : 'password'}
                className="input pr-10"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-3 top-2.5 text-paper-500 hover:text-paper-100"
              >
                {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="new-password">
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNewPass ? 'text' : 'password'}
                className="input pr-10"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-3 top-2.5 text-paper-500 hover:text-paper-100"
              >
                {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password Strength Indicator */}
            {newPassword && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-ink-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      newPassword.length < 6
                        ? 'w-1/4 bg-rose-500'
                        : newPassword.length < 10
                        ? 'w-2/3 bg-amber-400'
                        : 'w-full bg-emerald-400'
                    }`}
                  />
                </div>
                <span className="text-[10px] text-paper-400">
                  {newPassword.length < 6
                    ? 'Too short'
                    : newPassword.length < 10
                    ? 'Moderate'
                    : 'Strong'}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="confirm-password">
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              className="input"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary mt-2"
            disabled={isUpdatingPassword}
          >
            <Lock size={15} />
            <span>{isUpdatingPassword ? 'Updating...' : 'Update Password'}</span>
          </button>
        </form>
      </div>

      {/* Active Browser Session Card */}
      <div className="panel p-6">
        <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
          <Laptop size={18} className="text-cyan-400" />
          <span>Active Browser Session</span>
        </h2>
        <p className="mt-1 text-xs text-paper-500">
          Details regarding the current browser and device connected to Linkora.
        </p>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-ink-700 bg-ink-950 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-accent-400 border border-ink-700">
              <Laptop size={20} />
            </div>
            <div>
              <div className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                <span>{navigator.userAgent.includes('Mac') ? 'macOS Device' : 'Desktop Device'}</span>
                <span className="badge text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  Current Session
                </span>
              </div>
              <div className="text-xs text-paper-500 mt-0.5 truncate max-w-sm sm:max-w-md">
                {navigator.userAgent}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="btn-secondary btn-sm self-start sm:self-center"
          >
            Sign Out
          </button>
        </div>
      </div>
    </motion.div>
  );
}
