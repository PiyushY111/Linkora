import { Lock, Users, Calendar, Eye, EyeOff } from 'lucide-react';
import { MAX_CLICK_PRESETS, EXPIRY_PRESETS, presetExpiry } from './linkDrawerHelpers';

const SECTION_CLASS = 'rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2';
const REMOVE_BUTTON_CLASS = 'text-[11px] text-danger hover:underline';
const UNDO_BUTTON_CLASS = 'text-[11px] text-accent-400 hover:underline';

function PasswordSection({ link, edit }) {
  const { form, setField, showPassword, setShowPassword } = edit;
  return (
    <div className={SECTION_CLASS}>
      <div className="flex items-center justify-between">
        <label className="field-label mb-0 flex items-center gap-1.5" htmlFor="drawerPassword">
          <Lock size={13} className="text-accent-400" />
          <span>Password Protection</span>
        </label>
        {link.password && !form.removePassword && (
          <button type="button" onClick={() => setField('removePassword', true)} className={REMOVE_BUTTON_CLASS}>
            Remove password
          </button>
        )}
        {form.removePassword && (
          <button type="button" onClick={() => setField('removePassword', false)} className={UNDO_BUTTON_CLASS}>
            Undo remove
          </button>
        )}
      </div>

      {form.removePassword ? (
        <p className="text-xs text-danger/80">Password protection will be removed when you save.</p>
      ) : (
        <div className="relative">
          <input
            id="drawerPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder={link.password ? 'Leave blank to keep current password' : 'Enter secret password to protect'}
            value={form.newPassword}
            onChange={(e) => setField('newPassword', e.target.value)}
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

function ClickLimitSection({ link, edit }) {
  const { form, setField, removeMaxClicks, undoRemoveMaxClicks, toggleMaxClicks } = edit;
  return (
    <div className={SECTION_CLASS}>
      <div className="flex items-center justify-between">
        <label className="field-label mb-0 flex items-center gap-1.5" htmlFor="drawerMaxClicks">
          <Users size={13} className="text-accent-400" />
          <span>Click Limit (Max Opens)</span>
        </label>
        {link.maxClicks && !form.removeMaxClicks && (
          <button type="button" onClick={removeMaxClicks} className={REMOVE_BUTTON_CLASS}>
            Remove limit
          </button>
        )}
        {form.removeMaxClicks && (
          <button type="button" onClick={undoRemoveMaxClicks} className={UNDO_BUTTON_CLASS}>
            Undo remove
          </button>
        )}
        {!link.maxClicks && (
          <button
            type="button"
            onClick={toggleMaxClicks}
            className={`text-[11px] font-semibold ${
              form.enableMaxClicks ? 'text-accent-400' : 'text-paper-400 hover:text-paper-200'
            }`}
          >
            {form.enableMaxClicks ? 'Enabled' : 'Add limit'}
          </button>
        )}
      </div>

      {form.removeMaxClicks ? (
        <p className="text-xs text-danger/80">Click limit will be removed on save (unlimited opens allowed).</p>
      ) : form.enableMaxClicks ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <input
              id="drawerMaxClicks"
              type="number"
              min="1"
              placeholder="e.g. 50"
              value={form.maxClicks}
              onChange={(e) => setField('maxClicks', e.target.value)}
              className="input font-mono text-xs"
            />
            <span className="text-xs text-paper-400 whitespace-nowrap">max opens</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-paper-500">Presets:</span>
            {MAX_CLICK_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setField('maxClicks', String(preset))}
                className={`rounded px-2 py-0.5 text-xs font-mono transition-colors ${
                  form.maxClicks === String(preset)
                    ? 'bg-accent-400 text-ink-950 font-bold'
                    : 'bg-ink-800 text-paper-300 hover:text-paper-100'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-paper-500">No limit set (unlimited opens allowed).</p>
      )}
    </div>
  );
}

function ExpirySection({ link, edit }) {
  const { form, setField, removeExpiry } = edit;
  return (
    <div className={SECTION_CLASS}>
      <div className="flex items-center justify-between">
        <label className="field-label mb-0 flex items-center gap-1.5">
          <Calendar size={13} className="text-accent-400" />
          <span>Link Expiration</span>
        </label>
        {link.expiryDate && !form.removeExpiryDate && (
          <button type="button" onClick={removeExpiry} className={REMOVE_BUTTON_CLASS}>
            Remove expiry
          </button>
        )}
        {form.removeExpiryDate && (
          <button type="button" onClick={() => setField('removeExpiryDate', false)} className={UNDO_BUTTON_CLASS}>
            Undo remove
          </button>
        )}
      </div>

      {form.removeExpiryDate ? (
        <p className="text-xs text-danger/80">Expiration will be removed on save (link will never expire).</p>
      ) : (
        <div className="space-y-2 pt-1">
          <input
            type="datetime-local"
            value={form.expiryDate}
            onChange={(e) => setField('expiryDate', e.target.value)}
            className="input text-xs"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-paper-500">Presets:</span>
            {EXPIRY_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setField('expiryDate', presetExpiry(p.hours))}
                className="rounded px-2 py-0.5 text-xs font-mono bg-ink-800 text-paper-300 hover:text-paper-100 transition-colors"
              >
                +{p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Password, click limit and expiry, each with an undo-able "remove" action. */
export default function EditAccessControls(props) {
  return (
    <>
      {/* Password Protection */}
      <PasswordSection {...props} />
      {/* Click Limit (Max Opens) */}
      <ClickLimitSection {...props} />
      {/* Expiration Settings */}
      <ExpirySection {...props} />
    </>
  );
}
