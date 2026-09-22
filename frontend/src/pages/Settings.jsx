import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Copy, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import { useConfirm } from '../context/ConfirmContext';
import { authService } from '../services';
import useAuthStore from '../context/authStore';

const Settings = () => {
  const confirm = useConfirm();
  const { user, setUser } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({ name: user?.name || '', bio: user?.bio || '' });
  const [apiKey, setApiKey] = useState(null);

  // user hydrates asynchronously (see ProtectedRoute) and can arrive after
  // this component's initial render, so the form fields need to pick up
  // the value once it lands rather than only reading it at mount.
  useEffect(() => {
    if (user) setFormData({ name: user.name || '', bio: user.bio || '' });
  }, [user]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = await authService.updateProfile(formData);
      setUser(data.user);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateApiKey = async () => {
    const confirmed = await confirm({
      title: 'Generate New API Key',
      message: 'Generating a new API key will immediately invalidate your previous primary key. Any integrations or scripts relying on the old key will stop working.',
      confirmText: 'Generate Key',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!confirmed) return;

    setIsGenerating(true);
    try {
      const data = await authService.generateApiKey();
      setApiKey(data.apiKey);
      toast.success('API key generated');
    } catch {
      toast.error('Failed to generate API key');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyApiKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    toast.success('Copied to clipboard');
  };

  return (
    <>
      <Helmet>
        <title>Settings — Linkly</title>
      </Helmet>
      <AppShell>
        <h1 className="mb-8 text-2xl font-bold tracking-tight text-paper-100">Settings</h1>

        <div className="max-w-2xl space-y-6">
          <div className="panel p-6">
            <h2 className="text-base font-semibold text-paper-100">Profile</h2>
            <p className="mt-1 text-sm text-paper-500">Update your name and bio.</p>

            <form onSubmit={handleUpdateProfile} className="mt-5 space-y-4">
              <div>
                <label className="field-label" htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="email">Email</label>
                <input id="email" type="email" className="input opacity-60" value={user?.email || ''} disabled />
              </div>

              <div>
                <label className="field-label" htmlFor="bio">Bio</label>
                <textarea
                  id="bio"
                  className="input"
                  rows="3"
                  placeholder="Tell us about yourself"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-primary" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          </div>

          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-paper-100">Plan</h2>
                <p className="mt-1 text-sm text-paper-500">Determines your hourly link-creation quota.</p>
              </div>
              <span className="badge-accent capitalize">{user?.plan || 'free'}</span>
            </div>
          </div>

          <div className="panel p-6">
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-paper-400" />
              <h2 className="text-base font-semibold text-paper-100">API key</h2>
            </div>
            <p className="mt-1 text-sm text-paper-500">
              Use this key with the <code className="font-mono text-xs text-paper-300">x-api-key</code> header on
              the public API (see the Developer page).
            </p>

            {apiKey ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-950 px-3 py-2.5">
                <span className="flex-1 truncate font-mono text-sm text-accent-400">{apiKey}</span>
                <button type="button" onClick={copyApiKey} className="btn-ghost btn-sm">
                  <Copy size={13} /> Copy
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-paper-500">No API key generated yet.</p>
            )}

            <button
              type="button"
              onClick={handleGenerateApiKey}
              className="btn-secondary mt-4"
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating…' : apiKey ? 'Regenerate key' : 'Generate API key'}
            </button>
          </div>
        </div>
      </AppShell>
    </>
  );
};

export default Settings;
