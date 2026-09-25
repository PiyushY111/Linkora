import { motion } from 'framer-motion';
import { Lock, Calendar, Users, Globe, Eye, EyeOff } from 'lucide-react';
import { EXPIRY_PRESETS, MAX_CLICK_PRESETS } from './constants';

const presetButtonClass = (isActive) =>
  `rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
    isActive
      ? 'bg-accent-400 text-ink-950 shadow-glow'
      : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
  }`;

const toggleButtonClass = (isOn) =>
  `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
    isOn ? 'bg-accent-400 text-ink-950' : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
  }`;

function PasswordCard({ formData, showPassword, setShowPassword, actions }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-accent-400" />
          <div>
            <h4 className="text-sm font-semibold text-paper-100">Password Protection</h4>
            <p className="text-xs text-paper-500">
              Visitors must enter a password on Linkora's unlock gate to be redirected.
            </p>
          </div>
        </div>
        <button type="button" onClick={actions.togglePassword} className={toggleButtonClass(formData.enablePassword)}>
          {formData.enablePassword ? 'Protection Enabled' : 'Enable Password'}
        </button>
      </div>

      {formData.enablePassword && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-2">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required={formData.enablePassword}
              placeholder="Type secret password for this link..."
              value={formData.password}
              onChange={(e) => actions.setField('password', e.target.value)}
              className="input font-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-500 hover:text-paper-200"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-paper-500">
            Passwords are cryptographically hashed using bcrypt before storage.
          </p>
        </motion.div>
      )}
    </div>
  );
}

function ExpiryCard({ formData, actions }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-accent-400" />
        <div>
          <h4 className="text-sm font-semibold text-paper-100">Link Expiration</h4>
          <p className="text-xs text-paper-500">Automatically disable this link after a set time window.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {EXPIRY_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => actions.setField('expiryOption', preset.label)}
            className={presetButtonClass(formData.expiryOption === preset.label)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => actions.setField('expiryOption', 'Custom')}
          className={presetButtonClass(formData.expiryOption === 'Custom')}
        >
          Custom Date
        </button>
      </div>

      {formData.expiryOption === 'Custom' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-2">
          <input
            type="datetime-local"
            value={formData.customExpiryDate}
            onChange={(e) => actions.setField('customExpiryDate', e.target.value)}
            className="input"
          />
        </motion.div>
      )}
    </div>
  );
}

function ClickQuotaCard({ formData, actions }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className={formData.enableMaxClicks ? 'text-accent-400' : 'text-paper-500'} />
          <div>
            <h4 className="text-sm font-semibold text-paper-100">Maximum Opens (Click Quota)</h4>
            <p className="text-xs text-paper-500">
              Automatically expire and block this link after a set number of users open it.
            </p>
          </div>
        </div>
        <button type="button" onClick={actions.toggleMaxClicks} className={toggleButtonClass(formData.enableMaxClicks)}>
          {formData.enableMaxClicks ? 'Quota Enabled' : 'Enable Limit'}
        </button>
      </div>

      {formData.enableMaxClicks && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="pt-2 space-y-2"
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              required={formData.enableMaxClicks}
              placeholder="e.g. 50"
              value={formData.maxClicks}
              onChange={(e) => actions.setField('maxClicks', e.target.value)}
              className="input font-mono"
            />
            <span className="text-xs text-paper-400 whitespace-nowrap">max opens</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-paper-500">Presets:</span>
            {MAX_CLICK_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => actions.setField('maxClicks', String(preset))}
                className={`rounded px-2.5 py-1 text-xs font-mono transition-colors ${
                  formData.maxClicks === String(preset)
                    ? 'bg-accent-400 text-ink-950 font-bold'
                    : 'bg-ink-800 text-paper-300 hover:text-paper-100'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function FallbackUrlCard({ formData, actions }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Globe size={16} className="text-accent-400" />
        <div>
          <h4 className="text-sm font-semibold text-paper-100">Fallback Expired URL (Optional)</h4>
          <p className="text-xs text-paper-500">
            Where to send visitors when this link expires or reaches its maximum opens limit.
          </p>
        </div>
      </div>
      <input
        type="url"
        placeholder="https://yourcompany.com/campaign-ended"
        value={formData.expiredRedirectUrl}
        onChange={(e) => actions.setField('expiredRedirectUrl', e.target.value)}
        className="input font-mono text-xs"
      />
    </div>
  );
}

export default function SecurityTab(props) {
  return (
    <div className="space-y-5">
      {/* Dedicated Password Protection Box */}
      <PasswordCard {...props} />
      {/* Expiration Settings */}
      <ExpiryCard {...props} />
      {/* Maximum Opens / Click Quota */}
      <ClickQuotaCard {...props} />
      {/* Fallback Destination URL */}
      <FallbackUrlCard {...props} />
    </div>
  );
}
