import { useState } from 'react';
import { Copy, Check, Trash2, Power, Download, X, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import { linkService } from '../../services';
import useLinkStore from '../../context/linkStore';
import { useConfirm } from '../../context/ConfirmContext';

export default function QRBulkActionBar({ selectedIds, links, onClearSelection }) {
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

  const handleBulkDownloadQRs = async () => {
    let downloadedCount = 0;
    for (const link of selectedLinks) {
      if (link.qrCode) {
        const a = document.createElement('a');
        a.href = link.qrCode;
        a.download = `${link.shortCode || 'qr'}-asset.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        downloadedCount++;
      }
    }
    if (downloadedCount > 0) {
      toast.success(`Triggered download for ${downloadedCount} QR images`);
    } else {
      toast.error('No generated QR image data available for selected items');
    }
  };

  const handleBulkToggle = async () => {
    setIsProcessing(true);
    try {
      await Promise.all(
        selectedLinks.map(async (l) => {
          const updated = await linkService.updateLink(l._id, { isActive: !l.isActive });
          updateLink(updated.link || updated);
        })
      );
      toast.success(`Updated status for ${selectedLinks.length} QR codes`);
    } catch {
      toast.error('Failed to update some QR codes');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirm({
      title: `Delete ${selectedLinks.length} Selected QR Codes`,
      message: `Are you sure you want to permanently delete these ${selectedLinks.length} QR assets? Their dynamic short URLs will stop redirecting immediately and this action cannot be undone.`,
      confirmText: `Delete ${selectedLinks.length} QR Codes`,
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
      toast.success(`Deleted ${selectedLinks.length} QR assets`);
      onClearSelection();
    } catch {
      toast.error('Failed to delete some QR assets');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportCsv = () => {
    try {
      const data = selectedLinks.map((l) => ({
        'Short Code': l.shortCode,
        'Short URL': l.shortUrl,
        'Original Destination': l.originalUrl,
        'Title': l.title || '',
        'Total Scans': l.clicks || 0,
        'Status': l.isActive ? 'Active' : 'Disabled',
        'Category': l.category || 'other',
        'Created At': l.createdAt,
      }));

      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linkora-qr-catalog-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`Exported ${selectedLinks.length} QR codes to CSV`);
    } catch {
      toast.error('Failed to generate CSV export');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-ink-600 bg-ink-900/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
          {/* Badge Counter */}
          <div className="flex items-center gap-2 border-r border-ink-700 pr-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-400 text-xs font-bold text-ink-950">
              {selectedLinks.length}
            </span>
            <span className="hidden text-xs font-semibold text-paper-200 sm:inline">
              Selected
            </span>
          </div>

          {/* Quick Actions */}
          <button
            type="button"
            onClick={handleCopyAll}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-paper-300 hover:bg-ink-800 hover:text-paper-100"
            title="Copy all short URLs"
          >
            {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            <span className="hidden md:inline">{copied ? 'Copied' : 'Copy URLs'}</span>
          </button>

          <button
            type="button"
            onClick={handleBulkDownloadQRs}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-400 hover:bg-ink-800"
            title="Download QR image PNGs"
          >
            <Download size={13} />
            <span className="hidden md:inline">Download QRs</span>
          </button>

          <button
            type="button"
            onClick={handleBulkToggle}
            disabled={isProcessing}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-paper-300 hover:bg-ink-800 hover:text-paper-100"
            title="Toggle pause / active state"
          >
            <Power size={13} />
            <span className="hidden md:inline">Toggle Status</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-paper-300 hover:bg-ink-800 hover:text-paper-100"
            title="Export selected as CSV"
          >
            <Download size={13} />
            <span className="hidden md:inline">CSV</span>
          </button>

          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isProcessing}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
            title="Delete selected links permanently"
          >
            <Trash2 size={13} />
            <span className="hidden md:inline">Delete</span>
          </button>

          {/* Dismiss Selection */}
          <button
            type="button"
            onClick={onClearSelection}
            className="ml-1 rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-200"
            title="Clear Selection"
          >
            <X size={14} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
