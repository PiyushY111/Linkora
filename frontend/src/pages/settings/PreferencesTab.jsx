import { motion } from 'framer-motion';
import { BarChart3, Shield, Bell, Save } from 'lucide-react';
import { ANALYTICS_RANGES } from './constants';

/** Default analytics range, IP anonymization and (not yet available) email notifications. */
export default function PreferencesTab({ form }) {
  const { analyticsRange, setAnalyticsRange, anonymizeIps, setAnonymizeIps, isSavingPreferences, handleSavePreferences } = form;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl"
    >
      <div className="panel p-6">
        <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
          <BarChart3 size={18} className="text-accent-400" />
          <span>Analytics & Privacy Controls</span>
        </h2>
        <p className="mt-1 text-xs text-paper-500">
          Configure your default chart telemetry timeframe and data privacy settings.
        </p>

        <form onSubmit={handleSavePreferences} className="mt-6 space-y-6">
          {/* Default Time Range */}
          <div>
            <label className="field-label" htmlFor="analytics-range">
              Default Analytics Timeframe
            </label>
            <select
              id="analytics-range"
              className="input"
              value={analyticsRange}
              onChange={(e) => setAnalyticsRange(e.target.value)}
            >
              {ANALYTICS_RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-paper-500">
              The initial date filter loaded whenever viewing detailed link analytics.
            </p>
          </div>

          {/* Visitor IP anonymization toggle */}
          <div className="flex items-start justify-between rounded-xl border border-ink-700 bg-ink-950 p-4">
            <div>
              <h3 id="anonymize-ips-label" className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                <Shield size={16} className="text-emerald-400" aria-hidden="true" />
                <span>Visitor IP Anonymization</span>
              </h3>
              <p id="anonymize-ips-description" className="mt-1 text-xs text-paper-400 max-w-xl leading-relaxed">
                Mask visitor IP addresses before they are stored: IPv4 keeps its first three octets
                (e.g. <code className="text-accent-400 font-mono text-[11px]">203.0.113.0</code>), IPv6 its
                first 48 bits. Applies to clicks recorded after you turn it on; clicks already stored are
                not changed.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={anonymizeIps}
              aria-labelledby="anonymize-ips-label"
              aria-describedby="anonymize-ips-description"
              onClick={() => setAnonymizeIps(!anonymizeIps)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                anonymizeIps ? 'bg-accent-400' : 'bg-ink-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-ink-950 transition duration-200 ease-in-out ${
                  anonymizeIps ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Email notifications: no email delivery exists yet, so the
              switch is shown but disabled. */}
          <div className="flex items-start justify-between rounded-xl border border-ink-700 bg-ink-950 p-4 opacity-60">
            <div>
              <h3 id="email-notifications-label" className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                <Bell size={16} className="text-amber-400" aria-hidden="true" />
                <span>Click Milestone Email Notifications</span>
                <span className="rounded-full border border-ink-600 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-paper-400">
                  Coming soon
                </span>
              </h3>
              <p id="email-notifications-description" className="mt-1 text-xs text-paper-400 max-w-xl leading-relaxed">
                Not available yet: Linkora does not send email. When it does, this will alert you when a
                link crosses 1,000, 10,000 and 100,000 clicks.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={false}
              aria-disabled="true"
              disabled
              aria-labelledby="email-notifications-label"
              aria-describedby="email-notifications-description"
              className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-ink-700"
            >
              <span className="inline-block h-5 w-5 translate-x-0 transform rounded-full bg-ink-950" />
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn-primary" disabled={isSavingPreferences}>
              <Save size={15} />
              <span>{isSavingPreferences ? 'Saving...' : 'Save Preferences'}</span>
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
