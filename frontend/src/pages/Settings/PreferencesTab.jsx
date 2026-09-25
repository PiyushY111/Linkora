import { BarChart3, Shield, Bell, Save } from 'lucide-react';
import SettingsTabPanel from './SettingsTabPanel';
import { ANALYTICS_RANGES } from './settingsConstants';
import ToggleRow from '../../components/ui/ToggleRow';

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
