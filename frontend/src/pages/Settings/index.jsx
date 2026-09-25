import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import AppShell from '../../components/layout/AppShell';
import useAuthStore from '../../context/authStore';
import { SETTINGS_TABS } from './settingsConstants';
import {
  useProfileForm,
  useLinkDefaultsForm,
  usePasswordForm,
  usePreferencesForm,
  useAccountData,
} from './useSettingsForms';
import ProfileTab from './ProfileTab';
import LinkDefaultsTab from './LinkDefaultsTab';
import SecurityTab from './SecurityTab';
import PreferencesTab from './PreferencesTab';
import DataTab from './DataTab';
import DeleteAccountModal from './DeleteAccountModal';

function SettingsTabNav({ activeTab, onChange }) {
  return (
    <div className="mb-8 flex overflow-x-auto border-b border-ink-700 pb-px scrollbar-none gap-2">
      {SETTINGS_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
              isActive
                ? 'border-accent-400 text-accent-400 bg-ink-800/40'
                : 'border-transparent text-paper-400 hover:text-paper-100 hover:bg-ink-800/20'
            }`}
          >
            <Icon size={16} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function Settings() {
  const { user, setUser, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');

  const profile = useProfileForm(user, setUser);
  const defaults = useLinkDefaultsForm(user, setUser);
  const password = usePasswordForm();
  const preferences = usePreferencesForm(user, setUser);
  const account = useAccountData(logout);

  return (
    <>
      <Helmet>
        <title>Settings & Preferences — Linkora</title>
      </Helmet>
      <AppShell>
        {/* Header */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge text-[10px] bg-accent-400/10 text-accent-400 border border-accent-400/25">
                CONFIGURATION
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-paper-100">Settings & Preferences</h1>
            <p className="text-xs text-paper-500">
              Manage your personal profile, link creation defaults, security credentials, and data exports.
            </p>
          </div>
        </div>

        <SettingsTabNav activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === 'profile' && <ProfileTab user={user} profile={profile} />}
        {activeTab === 'defaults' && <LinkDefaultsTab defaults={defaults} />}
        {activeTab === 'security' && <SecurityTab password={password} onSignOut={logout} />}
        {activeTab === 'preferences' && <PreferencesTab preferences={preferences} />}
        {activeTab === 'data' && <DataTab account={account} />}

        <DeleteAccountModal email={user?.email} account={account} />
      </AppShell>
    </>
  );
}
