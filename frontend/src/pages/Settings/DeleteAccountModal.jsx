import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Eye, EyeOff, Trash2, X } from 'lucide-react';

/** Password confirmation before the account is deleted. */
export default function DeleteAccountModal({ email, account }) {
  const {
    showDeleteModal,
    setShowDeleteModal,
    closeDeleteModal,
    isDeletingAccount,
    deletePassword,
    setDeletePassword,
    showDeletePasswordText,
    setShowDeletePasswordText,
    handleConfirmDeleteAccount,
  } = account;

  return (
    <AnimatePresence>
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDeleteModal}
            className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md rounded-2xl border border-rose-500/30 bg-ink-900 p-6 shadow-2xl shadow-rose-950/30"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-paper-50">Confirm Account Deletion</h3>
                  <p className="text-xs text-paper-400">Account: {email}</p>
                </div>
              </div>
              <button type="button" onClick={closeDeleteModal} className="text-paper-400 hover:text-paper-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300 leading-relaxed">
              <strong>Warning:</strong> This action cannot be undone. All shortened links, custom domains, analytics, webhooks, and API keys will be wiped permanently.
            </div>

            <form onSubmit={handleConfirmDeleteAccount} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-paper-300 mb-1">
                  Enter your password to authorize deletion:
                </label>
                <div className="relative">
                  <input
                    type={showDeletePasswordText ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Your account password"
                    disabled={isDeletingAccount}
                    autoFocus
                    className="w-full rounded-xl border border-ink-700 bg-ink-950 px-3.5 py-2.5 text-xs text-paper-100 placeholder-paper-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePasswordText(!showDeletePasswordText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-400 hover:text-paper-200"
                  >
                    {showDeletePasswordText ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeletingAccount}
                  className="rounded-xl border border-ink-700 bg-ink-800/80 px-4 py-2 text-xs font-medium text-paper-300 hover:bg-ink-700 hover:text-paper-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingAccount || !deletePassword}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-rose-950/40 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={13} />
                  <span>{isDeletingAccount ? 'Deleting...' : 'Delete Everything Permanently'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
