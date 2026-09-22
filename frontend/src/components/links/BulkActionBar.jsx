import { useState } from 'react';
import { Copy, Check, Trash2, Power, Download, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import { linkService } from '../../services';
import useLinkStore from '../../context/linkStore';
import { useConfirm } from '../../context/ConfirmContext';

export default function BulkActionBar({ selectedIds, links, onClearSelection }) {
  const confirm = useConfirm();
  const { removeLink, updateLink } = useLinkStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!selectedIds || selectedIds.length === 0) return null;

  const selectedLinks = links.filter((l) => selectedIds.includes(l._id));

  const handleCopyAll = () => {
    const urls = selectedLinks.map((l) => l.shortUrl).join('\n');
    navigator.clipboard.writeText(urls);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(`Copied ${selectedLinks.length} URLs to clipboard`);
  };

  const handleBulkToggle = async () => {
    setIsProcessing(true);
    try {
      // Toggle each selected link in parallel
      await Promise.all(
        selectedLinks.map(async (l) => {
          const updated = await linkService.updateLink(l._id, { isActive: !l.isActive });
          updateLink(updated.link || updated);
        })
      );
      toast.success(`Updated status for ${selectedLinks.length} links`);
    } catch (error) {
      toast.error('Failed to update some links');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirm({
      title: `Delete ${selectedLinks.length} Selected Links`,
      message: `Are you sure you want to permanently delete these ${selectedLinks.length} links? Their short URLs will stop redirecting immediately and this action cannot be undone.`,
      confirmText: `Delete ${selectedLinks.length} Links`,
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsProcessing(true);
    try {
      await Promise.all(
        selectedLinks.map(async (l) => {
          await linkService.deleteLink(l._id);
          removeLink(l._id);
        })
      );
      toast.success(`Deleted ${selectedLinks.length} links`);
      onClearSelection();
    } catch (error) {
      toast.error('Failed to delete some links');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportCsv = () => {
    try {
      const data = selectedLinks.map((l) => ({
        'Short Code': l.shortCode,
        'Short URL': l.shortUrl,
        'Original URL': l.originalUrl,
        'Title': l.title || '',
        'Clicks': l.clicks || 0,
        'Status': l.isActive ? 'Active' : 'Disabled',
        'Category': l.category || 'other',
        'Created At': l.createdAt,
      }));

      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `linkly-selected-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Exported ${selectedLinks.length} links to CSV`);
    } catch {
      toast.error('Failed to generate CSV export');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-ink-600 bg-ink-900/95 px-4 py-2.5 shadow-2xl backdrop-blur-md"
      >
        <div className="flex items-center gap-2 border-r border-ink-700 pr-3 text-xs font-semibold text-paper-100">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-400 text-xs font-bold text-ink-950">
            {selectedIds.length}
          </span>
          <span>Selected</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyAll}
            className="btn-ghost btn-sm text-paper-200 hover:text-paper-100"
            title="Copy all selected URLs"
          >
            {copied ? <Check size={14} className="text-accent-400" /> : <Copy size={14} />}
            <span>Copy URLs</span>
          </button>

          <button
            type="button"
            onClick={handleBulkToggle}
            disabled={isProcessing}
            className="btn-ghost btn-sm text-paper-200 hover:text-paper-100"
            title="Toggle active status"
          >
            <Power size={14} />
            <span>Toggle Status</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="btn-ghost btn-sm text-paper-200 hover:text-paper-100"
            title="Export selected as CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isProcessing}
            className="btn-danger btn-sm"
            title="Delete selected links"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>

        <div className="border-l border-ink-700 pl-2">
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-lg p-1 text-paper-500 hover:bg-ink-800 hover:text-paper-100"
            title="Clear selection"
          >
            <X size={15} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
