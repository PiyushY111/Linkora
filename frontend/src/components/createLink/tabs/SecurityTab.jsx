import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, Calendar, Users, Globe } from 'lucide-react';
import { EXPIRY_PRESETS } from '../constants';

/** Password protection, expiry, click quota and fallback URL. */
export default function SecurityTab({ formData, setFormData, showPassword, setShowPassword }) {
  return (
    <div className="space-y-5">
      {/* Dedicated Password Protection Box */}
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
          <button
            type="button"
            onClick={() => {
              const next = !formData.enablePassword;
              setFormData({
                ...formData,
                enablePassword: next,
                password: next ? formData.password : '',
              });
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              formData.enablePassword
                ? 'bg-accent-400 text-ink-950'
                : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
            }`}
          >
            {formData.enablePassword ? 'Protection Enabled' : 'Enable Password'}
          </button>
        </div>

        {formData.enablePassword && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-2"
          >
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required={formData.enablePassword}
                placeholder="Type secret password for this link..."
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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

      {/* Expiration Settings */}
      <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-accent-400" />
          <div>
            <h4 className="text-sm font-semibold text-paper-100">Link Expiration</h4>
            <p className="text-xs text-paper-500">
              Automatically disable this link after a set time window.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {EXPIRY_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() =>
                setFormData({ ...formData, expiryOption: preset.label })
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                formData.expiryOption === preset.label
                  ? 'bg-accent-400 text-ink-950 shadow-glow'
                  : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFormData({ ...formData, expiryOption: 'Custom' })}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              formData.expiryOption === 'Custom'
                ? 'bg-accent-400 text-ink-950 shadow-glow'
                : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
            }`}
          >
            Custom Date
          </button>
        </div>

        {formData.expiryOption === 'Custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-2"
          >
            <input
              type="datetime-local"
              value={formData.customExpiryDate}
              onChange={(e) =>
                setFormData({ ...formData, customExpiryDate: e.target.value })
              }
              className="input"
            />
          </motion.div>
        )}
      </div>

      {/* Maximum Opens / Click Quota */}
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
          <button
            type="button"
            onClick={() => {
              const next = !formData.enableMaxClicks;
              setFormData({
                ...formData,
                enableMaxClicks: next,
                maxClicks: next ? formData.maxClicks || '25' : '',
              });
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              formData.enableMaxClicks
                ? 'bg-accent-400 text-ink-950'
                : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
            }`}
          >
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
                onChange={(e) => setFormData({ ...formData, maxClicks: e.target.value })}
                className="input font-mono"
              />
              <span className="text-xs text-paper-400 whitespace-nowrap">max opens</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-paper-500">Presets:</span>
              {[5, 25, 100, 500].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFormData({ ...formData, maxClicks: String(preset) })}
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

      {/* Fallback Destination URL */}
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
          onChange={(e) => setFormData({ ...formData, expiredRedirectUrl: e.target.value })}
          className="input font-mono text-xs"
        />
      </div>
    </div>
  );
}
