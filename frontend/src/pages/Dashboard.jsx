import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import Navbar from '../components/Navbar';
import { Link, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { linkService, authService } from '../services';
import useLinkStore from '../context/linkStore';
import useAuthStore from '../context/authStore';
import LinkCard from '../components/LinkCard';

const Dashboard = () => {
  const { user, setUser } = useAuthStore();
  const { links, setLinks, currentPage, setCurrentPage } = useLinkStore();
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    originalUrl: '',
    customAlias: '',
    title: '',
    description: '',
    tags: '',
  });

  useEffect(() => {
    fetchLinks();
    fetchCurrentUser();
  }, []);

  const fetchLinks = async () => {
    setIsLoading(true);
    try {
      const data = await linkService.getLinks(currentPage);
      setLinks(data.links);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to fetch links');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const data = await authService.getCurrentUser();
      setUser(data.user);
    } catch (error) {
      console.error('Failed to fetch user');
    }
  };

  const handleCreateLink = async (e) => {
    e.preventDefault();
    
    if (!formData.originalUrl) {
      toast.error('Please enter a URL');
      return;
    }

    setIsLoading(true);
    try {
      // Normalize URL: ensure protocol is present
      let normalizedUrl = formData.originalUrl.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      // Build payload, excluding empty optional fields
      const payload = {
        originalUrl: normalizedUrl,
        tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
      };
      if (formData.customAlias.trim()) payload.customAlias = formData.customAlias.trim();
      if (formData.title.trim()) payload.title = formData.title.trim();
      if (formData.description.trim()) payload.description = formData.description.trim();

      const newLink = await linkService.createLink(payload);
      
      setLinks([newLink.link, ...links]);
      setFormData({ originalUrl: '', customAlias: '', title: '', description: '', tags: '' });
      setShowCreateForm(false);
      toast.success('Link created successfully!');
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
        error.response?.data?.errors?.[0]?.msg ||
        'Failed to create link'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Dashboard - Linkly</title>
      </Helmet>
      <Navbar />
      
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {user?.name}, manage and track your shortened links
            </p>
          </div>

          {/* Create Link Section */}
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="btn btn-primary mb-8 flex items-center gap-2"
            >
              <Plus size={20} />
              Create New Link
            </button>
          ) : (
            <div className="card mb-8">
              <h2 className="text-2xl font-bold mb-6">Create New Short Link</h2>
              <form onSubmit={handleCreateLink} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">URL *</label>
                  <input
                    type="url"
                    className="input"
                    placeholder="https://example.com/very/long/url"
                    value={formData.originalUrl}
                    onChange={(e) => setFormData({ ...formData, originalUrl: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Custom Alias (Optional)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="my-custom-link"
                      value={formData.customAlias}
                      onChange={(e) => setFormData({ ...formData, customAlias: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Title (Optional)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="My Project"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                  <textarea
                    className="input"
                    placeholder="Link description"
                    rows="3"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Tags (Comma-separated, Optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="marketing, social, campaign"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  />
                </div>

                <div className="flex gap-3">
                  <button type="submit" className="btn btn-primary" disabled={isLoading}>
                    {isLoading ? 'Creating...' : 'Create Link'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowCreateForm(false);
                      setFormData({ originalUrl: '', customAlias: '', title: '', description: '', tags: '' });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Links List */}
          <div>
            <h2 className="text-2xl font-bold mb-6">Your Links</h2>
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : links.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {links.map((link) => (
                  <LinkCard
                    key={link._id}
                    link={link}
                    onEdit={(link) => console.log('Edit:', link)}
                    onShowAnalytics={(id) => window.location.href = `/analytics/${id}`}
                  />
                ))}
              </div>
            ) : (
              <div className="card text-center py-12">
                <Link size={48} className="mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No links yet</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Create your first shortened link to get started
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default Dashboard;
