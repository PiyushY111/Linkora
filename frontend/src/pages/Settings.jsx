import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Navbar from '../components/Navbar';
import { ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../services';
import useAuthStore from '../context/authStore';

const Settings = () => {
  const { user, setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState(null);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const data = await authService.updateProfile(formData);
      setUser(data.user);
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateApiKey = async () => {
    if (window.confirm('Generate a new API key? Old keys will be invalidated.')) {
      setIsLoading(true);
      try {
        const data = await authService.generateApiKey();
        setApiKey(data.apiKey);
        toast.success('API key generated successfully');
      } catch (error) {
        toast.error('Failed to generate API key');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const copyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      toast.success('API key copied to clipboard');
    }
  };

  return (
    <>
      <Helmet>
        <title>Settings - Linkly</title>
      </Helmet>
      <Navbar />

      <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">Settings</h1>

          {/* Profile Settings */}
          <div className="card mb-8">
            <h2 className="text-2xl font-bold mb-6">Profile Settings</h2>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  className="input bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                  value={user?.email}
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Bio</label>
                <textarea
                  className="input"
                  rows="4"
                  placeholder="Tell us about yourself..."
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* API Key */}
          <div className="card mb-8">
            <h2 className="text-2xl font-bold mb-6">API Key</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Use your API key to programmatically create and manage links
            </p>

            {apiKey ? (
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg mb-4">
                <div className="flex items-center gap-2">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    readOnly
                    className="flex-1 bg-transparent font-mono text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={copyApiKey}
                    className="btn btn-secondary text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-600 dark:text-gray-400 mb-4">No API key generated yet</p>
            )}

            <button
              type="button"
              onClick={handleGenerateApiKey}
              className="btn btn-primary"
              disabled={isLoading}
            >
              {isLoading ? 'Generating...' : 'Generate New API Key'}
            </button>
          </div>

          {/* Preferences */}
          <div className="card">
            <h2 className="text-2xl font-bold mb-6">Preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div>
                  <p className="font-medium">Dark Mode</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Enable dark theme</p>
                </div>
                <input type="checkbox" className="w-5 h-5" />
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Get updates on link activity</p>
                </div>
                <input type="checkbox" className="w-5 h-5" defaultChecked />
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div>
                  <p className="font-medium">Public Profile</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Make your profile public</p>
                </div>
                <input type="checkbox" className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default Settings;
