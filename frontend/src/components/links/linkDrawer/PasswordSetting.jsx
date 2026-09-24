import { Lock, Eye, EyeOff } from 'lucide-react';

/** Set, change or remove the link password. */
export default function PasswordSetting({ link, editor }) {
  const { removePassword, setRemovePassword, showPassword, setShowPassword, newPassword, setNewPassword } = editor;

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <label
          className="field-label mb-0 flex items-center gap-1.5"
          htmlFor="drawerPassword"
        >
          <Lock size={13} className="text-accent-400" />
          <span>Password Protection</span>
        </label>
        {link.password && !removePassword && (
          <button
            type="button"
            onClick={() => setRemovePassword(true)}
            className="text-[11px] text-danger hover:underline"
          >
            Remove password
          </button>
        )}
        {removePassword && (
          <button
            type="button"
            onClick={() => setRemovePassword(false)}
            className="text-[11px] text-accent-400 hover:underline"
          >
            Undo remove
          </button>
        )}
      </div>

      {removePassword ? (
        <p className="text-xs text-danger/80">
          Password protection will be removed when you save.
        </p>
      ) : (
        <div className="relative">
          <input
            id="drawerPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder={
              link.password
                ? 'Leave blank to keep current password'
                : 'Enter secret password to protect'
            }
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input font-mono pr-10 text-xs"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-500 hover:text-paper-200"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}
