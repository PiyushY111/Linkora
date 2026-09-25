import { BarChart3, Shield, Bell, Save } from 'lucide-react';
import SettingsTabPanel from './SettingsTabPanel';
import { ANALYTICS_RANGES } from './settingsConstants';

function ToggleRow({ icon, title, children, checked, onToggle }) {
  return (
    <div className="flex items-start justify-between rounded-xl border border-ink-700 bg-ink-950 p-4">
      <div>
        <h3 className="text-sm font-semibold text-paper-100 flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </h3>
        <p className="mt-1 text-xs text-paper-400 max-w-xl leading-relaxed">{children}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
          checked ? 'bg-accent-400' : 'bg-ink-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-ink-950 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export default function PreferencesTab({ preferences }) {
  const {
    analyticsRange,
    setAnalyticsRange,
    anonymizeIps,
    setAnonymizeIps,
    emailNotifications,
    setEmailNotifications,
    isSavingPreferences,
    handleSavePreferences,
  } = preferences;

  return (
    <SettingsTabPanel>
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

          {/* GDPR IP Anonymization Toggle */}
          <ToggleRow
            icon={<Shield size={16} className="text-emerald-400" />}
            title="Visitor IP Anonymization (GDPR Compliance)"
            checked={anonymizeIps}
            onToggle={() => setAnonymizeIps(!anonymizeIps)}
          >
            Automatically mask the last octet of visitor IP addresses (e.g.{' '}
            <code className="text-accent-400 font-mono text-[11px]">192.168.1.xxx</code>) before
            recording click analytics into the database.
          </ToggleRow>

          {/* Email Notifications Toggle */}
          <ToggleRow
            icon={<Bell size={16} className="text-amber-400" />}
            title="Click Milestone Email Notifications"
            checked={emailNotifications}
            onToggle={() => setEmailNotifications(!emailNotifications)}
          >
            Receive email alerts whenever any of your short links cross high-traffic milestones
            (1,000, 10,000, and 100,000 clicks).
          </ToggleRow>

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn-primary" disabled={isSavingPreferences}>
              <Save size={15} />
              <span>{isSavingPreferences ? 'Saving...' : 'Save Preferences'}</span>
            </button>
          </div>
        </form>
      </div>
    </SettingsTabPanel>
  );
}
