import { useState, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Plus,
  QrCode,
  Search,
  LayoutGrid,
  Table as TableIcon,
  Download,
  Sparkles,
  Layers,
  Activity,
  ShieldCheck,
  MousePointerClick,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import AppShell from '../components/layout/AppShell';
import QRTableView from '../components/qr/QRTableView';
import QRCard from '../components/qr/QRCard';
import QRDrawer from '../components/qr/QRDrawer';
import CreateQRModal from '../components/qr/CreateQRModal';
import QRCodeModal from '../components/qr/QRCodeModal';
import QRBulkActionBar from '../components/qr/QRBulkActionBar';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { linkService } from '../services';
import useLinkStore from '../context/linkStore';
import { useConfirm } from '../context/ConfirmContext';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'sales', label: 'Sales' },
  { value: 'product', label: 'Product' },
  { value: 'social', label: 'Social' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Other' },
];

const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Newest First' },
  { value: '-clicks', label: 'Most Scans' },
  { value: 'createdAt', label: 'Oldest First' },
  { value: 'title', label: 'Title (A–Z)' },
];

export default function QRCodeStudio() {
  const confirm = useConfirm();
  const { links, setLinks, updateLink, removeLink } = useLinkStore();
  const [isLoading, setIsLoading] = useState(true);

  // Modals & Panels
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inspectedLink, setInspectedLink] = useState(null);
  const [stylingLink, setStylingLink] = useState(null);

  // View preferences
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('linkly_qr_view_mode') || 'table';
  });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'disabled'
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('-createdAt');

  // Multi-selection
  const [selectedIds, setSelectedIds] = useState([]);

  const searchInputRef = useRef(null);

  // Persist view mode preference
  useEffect(() => {
    localStorage.setItem('linkly_qr_view_mode', viewMode);
  }, [viewMode]);

  // Global Keyboard Shortcuts: ⌘K to open create modal, / to search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCreateModal(true);
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch links from backend
  const fetchLinks = async () => {
    setIsLoading(true);
    try {
      const data = await linkService.getLinks({
        page: 1,
        limit: 100,
        sort: sortBy,
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
      });
      setLinks(data.links);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to fetch QR codes');
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch whenever filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLinks();
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, categoryFilter, sortBy]);

  // Executive Metrics Calculations
  const stats = useMemo(() => {
    const total = links.length;
    const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
    const active = links.filter((l) => l.isActive && !l.abuseFlag).length;
    const avgClicks = total > 0 ? (totalClicks / total).toFixed(1) : 0;
    return { total, totalClicks, active, avgClicks };
  }, [links]);

  // Multi-select handlers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === links.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(links.map((l) => l._id));
    }
  };

  // Dynamic destination link updater (called from Table, Cards, or Drawer)
  const handleUpdateDestination = async (id, newUrl) => {
    const res = await linkService.updateLink(id, { originalUrl: newUrl });
    if (res?.link) {
      updateLink(res.link);
      if (inspectedLink?._id === id) {
        setInspectedLink(res.link);
      }
    }
  };

  // Status toggle handler
  const handleToggleStatus = async (link) => {
    try {
      const updated = await linkService.updateLink(link._id, { isActive: !link.isActive });
      updateLink(updated.link || updated);
      toast.success(link.isActive ? 'QR code paused' : 'QR code activated');
    } catch {
      toast.error('Failed to change QR status');
    }
  };

  // Delete single QR code
  const handleDeleteLink = async (id) => {
    const link = links.find((l) => l._id === id);
    const confirmed = await confirm({
      title: 'Delete QR Code Asset',
      message: `Are you sure you want to delete ${link?.title || link?.shortCode || 'this QR code'}? Scans of this physical code will immediately stop redirecting.`,
      confirmText: 'Delete QR Code',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await linkService.deleteLink(id);
      removeLink(id);
      setSelectedIds((prev) => prev.filter((item) => item !== id));
      if (inspectedLink?._id === id) setInspectedLink(null);
      toast.success('QR Code deleted');
    } catch {
      toast.error('Failed to delete QR code');
    }
  };

  // Export full catalog to CSV
  const handleExportAllCsv = () => {
    if (links.length === 0) {
      toast.error('No QR codes to export');
      return;
    }
    try {
      const data = links.map((l) => ({
        'Short Code': l.shortCode,
        'Short URL': l.shortUrl,
        'Original Destination': l.originalUrl,
        'Title': l.title || '',
        'Total Scans': l.clicks || 0,
        'Status': l.abuseFlag ? 'Flagged' : l.isActive ? 'Active' : 'Disabled',
        'Category': l.category || 'other',
        'Created At': l.createdAt,
      }));

      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linkora-qr-studio-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`Exported ${links.length} QR codes to CSV`);
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  return (
    <>
      <Helmet>
        <title>Dynamic QR Studio & Assets — Linkora</title>
      </Helmet>

      <AppShell>
        {/* Page Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-paper-100">QR Studio & Assets</h1>
              <span className="badge-accent text-xs">Dynamic Engine</span>
            </div>
            <p className="mt-1 text-xs text-paper-500">
              High-resolution QR code generator with live vector rendering, designer frames, and zero-downtime dynamic routing.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportAllCsv}
              className="btn-secondary btn-sm hidden sm:flex"
              title="Download QR code catalog as CSV"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              <Plus size={16} />
              <span>Create QR Code</span>
              <kbd className="ml-1.5 hidden rounded bg-ink-950/20 px-1.5 py-0.5 text-[10px] font-semibold text-ink-950/80 sm:inline-block">
                ⌘K
              </kbd>
            </button>
          </div>
        </div>

        {/* Executive Stats Strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-paper-500">
                Total QR Assets
              </span>
              <QrCode size={15} className="text-paper-400" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-paper-100">{stats.total}</p>
          </div>

          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-paper-500">
                Live Scans
              </span>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-400" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-accent-400">
              {stats.totalClicks.toLocaleString()}
            </p>
          </div>

          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-paper-500">
                Dynamic Routing
              </span>
              <ShieldCheck size={15} className="text-success" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-paper-100">{stats.active}</p>
          </div>

          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-paper-500">
                Avg Scans / QR
              </span>
              <MousePointerClick size={15} className="text-paper-400" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-paper-100">{stats.avgClicks}</p>
          </div>
        </div>

        {/* Dynamic Redirection Explainer Banner */}
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-accent-400/20 bg-accent-400/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-400/10 text-accent-400 border border-accent-400/30">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-paper-100">Dynamic QR Codes Never Expire</h2>
              <p className="text-xs text-paper-400">
                Printed on business cards, flyers, or packaging? Change the destination URL anytime using the inline pencil editor or Inspector Drawer without altering the physical QR graphic.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn-secondary btn-sm shrink-0 whitespace-nowrap self-start sm:self-auto"
          >
            <Plus size={14} />
            <span>New Dynamic QR</span>
          </button>
        </div>

        {/* Controls Bar: Search, Status Tabs, Category, Sort & Layout Switcher */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-1">
            {[
              { id: 'all', label: 'All QR Codes' },
              { id: 'active', label: 'Active' },
              { id: 'disabled', label: 'Paused' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-ink-750 text-paper-100 shadow-sm border border-ink-600'
                    : 'text-paper-500 hover:text-paper-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Tooling */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] sm:w-72 lg:w-80 sm:flex-initial">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-paper-500"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search QR codes, short codes, URLs... (/)"
                className="w-full rounded-lg border border-ink-700 bg-ink-900 py-1.5 pl-8 pr-7 text-xs text-paper-100 placeholder:text-paper-500 focus:border-accent-400/80 focus:ring-1 focus:ring-accent-400/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-paper-500 hover:text-paper-200"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Category Dropdown */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-paper-300 outline-none focus:border-ink-500"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-paper-300 outline-none focus:border-ink-500"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {/* View Mode Toggle: Table ⇄ Cards */}
            <div className="flex items-center rounded-lg border border-ink-700 bg-ink-900 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`rounded-md p-1.5 transition-colors ${
                  viewMode === 'table'
                    ? 'bg-ink-750 text-accent-400 shadow-sm'
                    : 'text-paper-500 hover:text-paper-300'
                }`}
                title="Table View (Dense with Inline Editor)"
              >
                <TableIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-md p-1.5 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-ink-750 text-accent-400 shadow-sm'
                    : 'text-paper-500 hover:text-paper-300'
                }`}
                title="Card Grid View (Visual Previews)"
              >
                <LayoutGrid size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : links.length > 0 ? (
          <div>
            {viewMode === 'table' ? (
              <QRTableView
                links={links}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                onInspect={(link) => setInspectedLink(link)}
                onEditStyle={(link) => setStylingLink(link)}
                onToggleStatus={handleToggleStatus}
                onDelete={handleDeleteLink}
                onUpdateDestination={handleUpdateDestination}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {links.map((link) => (
                    <QRCard
                      key={link._id}
                      link={link}
                      isSelected={selectedIds.includes(link._id)}
                      onToggleSelect={handleToggleSelect}
                      onInspect={(l) => setInspectedLink(l)}
                      onEditStyle={(l) => setStylingLink(l)}
                      onToggleStatus={handleToggleStatus}
                      onDelete={handleDeleteLink}
                      onUpdateDestination={handleUpdateDestination}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={QrCode}
            title="No matching QR assets found"
            description={
              searchQuery || statusFilter !== 'all' || categoryFilter !== 'all'
                ? 'Try resetting your search query or category filter.'
                : 'Create your first dynamic QR code to start tracking scans and generating high-res vector graphics.'
            }
            action={
              searchQuery || statusFilter !== 'all' || categoryFilter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCategoryFilter('all');
                  }}
                  className="btn-secondary"
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary"
                >
                  <Plus size={16} /> Create Dynamic QR Code
                </button>
              )
            }
          />
        )}

        {/* Floating Bulk Actions Bar */}
        <QRBulkActionBar
          selectedIds={selectedIds}
          links={links}
          onClearSelection={() => setSelectedIds([])}
        />

        {/* Slide-Over QR Inspector & Designer Drawer */}
        <QRDrawer
          link={inspectedLink}
          open={Boolean(inspectedLink)}
          onClose={() => setInspectedLink(null)}
        />

        {/* Quick Style Customizer Modal */}
        <QRCodeModal
          open={Boolean(stylingLink)}
          link={stylingLink}
          onClose={() => setStylingLink(null)}
          onSaveSuccess={(updated) => {
            if (inspectedLink?._id === updated._id) {
              setInspectedLink(updated);
            }
          }}
        />

        {/* New Dynamic QR Code Generator Wizard Modal */}
        <CreateQRModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={(newLink) => {
            // Option to inspect newly created QR code immediately
            setInspectedLink(newLink);
          }}
        />
      </AppShell>
    </>
  );
}
