import { useState } from 'react';
import { Copy, Trash2, MoreVertical, BarChart3, Power, Lock, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Link as RouterLink } from 'react-router-dom';
import { linkService } from '../services';
import useLinkStore from '../context/linkStore';

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const LinkCard = ({ link }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const { removeLink, updateLink } = useLinkStore();

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this link? This cannot be undone.')) return;
    setIsLoading(true);
    try {
      await linkService.deleteLink(link._id);
      removeLink(link._id);
      toast.success('Link deleted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      const data = await linkService.toggleLinkStatus(link._id);
      updateLink(data.link);
      toast.success(data.link.isActive ? 'Link enabled' : 'Link disabled');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update link');
    } finally {
      setIsLoading(false);
      setShowMenu(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="panel p-5 transition-colors hover:border-ink-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-paper-100">{link.title || 'Untitled link'}</h3>
            {link.abuseFlag ? (
              <span className="badge-danger shrink-0"><ShieldAlert size={11} /> Flagged</span>
            ) : link.isActive ? (
              <span className="badge-success shrink-0">Active</span>
            ) : (
              <span className="badge-neutral shrink-0">Disabled</span>
            )}
            {link.password && <Lock size={12} className="shrink-0 text-paper-500" />}
          </div>
          {link.description && <p className="mt-0.5 truncate text-xs text-paper-500">{link.description}</p>}
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className="rounded-lg p-1.5 text-paper-500 transition-colors hover:bg-ink-700 hover:text-paper-100"
            aria-label="Link actions"
          >
            <MoreVertical size={16} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 py-1 shadow-panel">
                <RouterLink
                  to={`/analytics/${link._id}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-paper-200 hover:bg-ink-700"
                  onClick={() => setShowMenu(false)}
                >
                  <BarChart3 size={14} /> Analytics
                </RouterLink>
                <button
                  type="button"
                  onClick={handleToggle}
                  disabled={isLoading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-paper-200 hover:bg-ink-700"
                >
                  <Power size={14} /> {link.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => copyToClipboard(link.shortUrl)}
        className="mt-4 flex w-full items-center gap-2 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-left transition-colors hover:border-accent-400/40"
      >
        <span className="flex-1 truncate font-mono text-sm text-accent-400">{link.shortUrl}</span>
        <Copy size={14} className="shrink-0 text-paper-500" />
      </button>

      <div className="mt-4 flex items-end justify-between">
        <div className="flex gap-5 text-sm">
          <div>
            <p className="text-xs text-paper-500">Clicks</p>
            <p className="font-mono text-lg font-semibold text-paper-100">{link.clicks ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-paper-500">Created</p>
            <p className="text-sm text-paper-300">{formatDate(link.createdAt)}</p>
          </div>
        </div>
        {link.qrCode && (
          <img src={link.qrCode} alt="QR code" className="h-12 w-12 rounded-md ring-1 ring-ink-600" />
        )}
      </div>

      {link.tags?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {link.tags.map((tag) => (
            <span key={tag} className="badge-neutral">{tag}</span>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default LinkCard;
