import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { User as UserIcon, Link as LinkIcon, Shield, BarChart3, AlertTriangle } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { useConfirm } from '../context/ConfirmContext';
import useAuthStore from '../context/authStore';
import useProfileForm from './settings/hooks/useProfileForm';
import useLinkDefaultsForm from './settings/hooks/useLinkDefaultsForm';
import usePasswordForm from './settings/hooks/usePasswordForm';
import usePreferencesForm from './settings/hooks/usePreferencesForm';
import useAccountData from './settings/hooks/useAccountData';
import ProfileTab from './settings/ProfileTab';
import DefaultsTab from './settings/DefaultsTab';
import SecurityTab from './settings/SecurityTab';
import PreferencesTab from './settings/PreferencesTab';
import DataTab from './settings/DataTab';

export default function Settings() {
  const confirm = useConfirm();
  const { user, setUser, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');

  // Every tab's form state lives here, not in the tab, so unsaved edits
  // survive switching tabs.
  const profile = useProfileForm(user, setUser);
  const linkDefaults = useLinkDefaultsForm(user, setUser);
  const password = usePasswordForm();
  const preferences = usePreferencesForm(user, setUser);
  const accountData = useAccountData({ confirm, user, logout });

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
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-paper-100">
              Settings & Preferences
            </h1>
            <p className="text-xs text-paper-500">
              Manage your personal profile, link creation defaults, security credentials, and data exports.
            </p>
          </div>
        </div>

        {/* Tab Navigation Rail */}
        <div className="mb-8 flex overflow-x-auto border-b border-ink-700 pb-px scrollbar-none gap-2">
          {[
            { id: 'profile', label: 'Profile & Account', icon: UserIcon },
            { id: 'defaults', label: 'Link Defaults', icon: LinkIcon },
            { id: 'security', label: 'Security & Sessions', icon: Shield },
            { id: 'preferences', label: 'Analytics & Privacy', icon: BarChart3 },
            { id: 'data', label: 'Data & Danger Zone', icon: AlertTriangle },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
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

        {activeTab === 'profile' && <ProfileTab user={user} form={profile} />}
        {activeTab === 'defaults' && <DefaultsTab form={linkDefaults} />}
        {activeTab === 'security' && <SecurityTab form={password} logout={logout} />}
        {activeTab === 'preferences' && <PreferencesTab form={preferences} />}
        {activeTab === 'data' && <DataTab actions={accountData} />}
      </AppShell>
    </>
  );
}
