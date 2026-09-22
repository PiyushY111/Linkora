import React, { useState } from 'react';
import { Copy, Eye, Trash2, MoreVertical, QrCode, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { linkService } from '../services';
import useLinkStore from '../context/linkStore';

const LinkCard = ({ link, onEdit, onShowAnalytics }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const { removeLink } = useLinkStore();

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this link?')) {
      setIsLoading(true);
      try {
        await linkService.deleteLink(link._id);
        removeLink(link._id);
        toast.success('Link deleted successfully');
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to delete link');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="card hover:shadow-lg transition-shadow group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-white truncate">
            {link.title || 'Untitled'}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
            {link.description}
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          >
            <MoreVertical size={18} />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-700 rounded-lg shadow-lg z-10">
              <button
                onClick={() => {
                  onEdit(link);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2"
              >
                <Edit2 size={16} /> Edit
              </button>
              <button
                onClick={() => {
                  onShowAnalytics(link._id);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2"
              >
                <Eye size={16} /> Analytics
              </button>
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="w-full text-left px-4 py-2 hover:bg-red-100 dark:hover:bg-red-600 text-red-600 dark:text-red-400 flex items-center gap-2"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Short URL */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">Short URL</p>
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
          <input
            type="text"
            value={link.shortUrl}
            readOnly
            className="flex-1 bg-transparent text-sm font-mono text-blue-600 dark:text-blue-400 outline-none"
          />
          <button
            onClick={() => copyToClipboard(link.shortUrl)}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
          >
            <Copy size={16} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400">Clicks</p>
            <p className="font-semibold text-lg">{link.clicks || 0}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Created</p>
            <p className="font-semibold text-lg">{formatDate(link.createdAt)}</p>
          </div>
        </div>
        {link.qrCode && (
          <img src={link.qrCode} alt="QR Code" className="w-16 h-16 rounded-lg" />
        )}
      </div>

      {/* Tags */}
      {link.tags && link.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {link.tags.map((tag, idx) => (
            <span key={idx} className="badge badge-primary text-xs">
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default LinkCard;
