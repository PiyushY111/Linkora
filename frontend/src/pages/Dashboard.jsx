import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Link2 } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import LinkCard from '../components/LinkCard';
import CreateLinkModal from '../components/CreateLinkModal';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { linkService } from '../services';
import useLinkStore from '../context/linkStore';
import useAuthStore from '../context/authStore';

const Dashboard = () => {
  const { user } = useAuthStore();
  const { links, setLinks, currentPage } = useLinkStore();
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <>
      <Helmet>
        <title>Links — Linkly</title>
      </Helmet>
      <AppShell>
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-paper-100">Links</h1>
            <p className="mt-1 text-sm text-paper-500">
              {user?.name ? `Welcome back, ${user.name.split(' ')[0]}.` : 'Manage and track your shortened links.'}
            </p>
          </div>
          <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Plus size={16} /> New link
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-52" />
            ))}
          </div>
        ) : links.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AnimatePresence>
              {links.map((link) => (
                <LinkCard key={link._id} link={link} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <EmptyState
            icon={Link2}
            title="No links yet"
            description="Create your first shortened link to start tracking clicks."
            action={
              <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary">
                <Plus size={16} /> Create a link
              </button>
            }
          />
        )}
      </AppShell>

      <CreateLinkModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </>
  );
};

export default Dashboard;
