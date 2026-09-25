import { useState } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  BarChart3,
  SlidersHorizontal,
  Download,
  Trash2,
  Power,
  MoreHorizontal,
  Edit3,
  Sparkles,
  ShieldCheck,
  QrCode,
  Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link as RouterLink } from 'react-router-dom';
import ActionDropdown from '../ui/ActionDropdown';
import QRCodeViewer from './QRCodeViewer';

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export default function QRTableView({
  links,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onInspect,
  onEditStyle,
  onToggleStatus,
  onDelete,
  onUpdateDestination,
}) {
  // onToggleStatus / onDelete / onUpdateDestination are only passed for roles
  // that may change links; their controls are hidden otherwise.
  const [copiedId, setCopiedId] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const allSelected = links.length > 0 && selectedIds.length === links.length;

  const handleCopy = (id, shortUrl, e) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(shortUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Link copied to clipboard');
  };

  const handleStartEdit = (link, e) => {
    e?.stopPropagation();
    setEditingId(link._id);
    setEditUrl(link.originalUrl);
  };

  const handleSaveEdit = async (id, e) => {
    e?.stopPropagation();
    if (!editUrl.trim()) {
      toast.error('Destination URL cannot be empty');
      return;
    }
    let normalized = editUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    setIsSaving(true);
    try {
      await onUpdateDestination(id, normalized);
      setEditingId(null);
      toast.success('Destination updated! Future scans will redirect to this link.');
    } catch {
      toast.error('Failed to update destination');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPng = (link, e) => {
    e?.stopPropagation();
    if (!link.qrCode) {
      toast.error('No QR image available to download');
      return;
    }
    const a = document.createElement('a');
    a.href = link.qrCode;
    a.download = `${link.shortCode || 'qr'}-asset.png`;
    a.click();
    toast.success('Downloaded PNG');
  };

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 shadow-panel">
      <div className="overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[850px] text-left text-sm text-paper-300">
          <thead className="border-b border-ink-700 bg-ink-950/80 text-[11px] font-semibold uppercase tracking-wider text-paper-400 select-none">
            <tr>
              <th className="w-10 px-4 py-3.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onSelectAll}
                  className="rounded border-ink-600 bg-ink-800 text-accent-400 focus:ring-accent-400 cursor-pointer"
                />
              </th>
              <th className="w-16 px-3 py-3.5">QR Asset</th>
              <th className="px-4 py-3.5">Title & Short Link</th>
              <th className="px-4 py-3.5">Dynamic Destination URL</th>
              <th className="px-4 py-3.5">Category</th>
              <th className="px-4 py-3.5 text-right">Scans</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-ink-800">
            {links.map((link) => {
              const domain = getDomain(link.originalUrl);
              const isSelected = selectedIds.includes(link._id);
              const isEditingThis = editingId === link._id;

              return (
                <tr
                  key={link._id}
                  onClick={() => onInspect && onInspect(link)}
                  className={`group cursor-pointer transition-colors duration-150 hover:bg-ink-850/80 ${
                    isSelected ? 'bg-accent-400/5' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect && onToggleSelect(link._id)}
                      className="rounded border-ink-600 bg-ink-800 text-accent-400 focus:ring-accent-400 cursor-pointer"
                    />
                  </td>

                  {/* QR Asset Thumbnail */}
                  <td className="px-3 py-3.5">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditStyle && onEditStyle(link);
                      }}
                      className="relative group/qr h-12 w-12 cursor-pointer overflow-hidden rounded-xl bg-ink-950 p-1 ring-1 ring-ink-700 transition-all group-hover/qr:scale-105 group-hover/qr:ring-accent-400/50 flex items-center justify-center"
                      title="Click to customize QR design"
                    >
                      {link.qrCode ? (
                        <img
                          src={link.qrCode}
                          alt="QR Code"
                          className="h-full w-full object-contain rounded-lg"
                        />
                      ) : link.qrConfig ? (
                        <div className="h-full w-full flex items-center justify-center pointer-events-none">
                          <QRCodeViewer
                            data={link.shortUrl}
                            config={link.qrConfig}
                            size={40}
                            showFrame={false}
                          />
                        </div>
                      ) : (
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                            link.shortUrl
                          )}`}
                          alt="QR Code"
                          className="h-full w-full object-contain rounded-lg"
                        />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-ink-950/70 opacity-0 group-hover/qr:opacity-100 transition-opacity">
                        <Sparkles size={13} className="text-accent-400" />
                      </div>
                    </div>
                  </td>

                  {/* Title & Short Link */}
                  <td className="px-4 py-3.5 min-w-[200px]">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-paper-100 group-hover:text-accent-400 transition-colors">
                          {link.title || `/${link.shortCode}`}
                        </span>
                        {link.qrConfig && (
                          <span className="badge-accent text-[9px] px-1.5 py-0 font-mono">Styled</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="truncate text-accent-400 font-medium">{link.shortUrl}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopy(link._id, link.shortUrl, e)}
                          className="rounded p-1 text-paper-500 hover:text-paper-200 transition-colors"
                          title="Copy short link"
                        >
                          {copiedId === link._id ? <Check size={12} className="text-accent-400" /> : <Copy size={12} />}
                        </button>
                        <a
                          href={link.shortUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded p-1 text-paper-500 hover:text-paper-200 transition-colors"
                          title="Test destination redirect"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  </td>

                  {/* Dynamic Destination URL (with inline edit) */}
                  <td className="px-4 py-3.5 max-w-[280px]" onClick={(e) => isEditingThis && e.stopPropagation()}>
                    {isEditingThis ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="url"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          placeholder="https://new-url.com"
                          className="input font-mono text-xs py-1 px-2.5 flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(link._id, e);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => handleSaveEdit(link._id, e)}
                          disabled={isSaving}
                          className="btn-primary btn-sm px-2.5 py-1 text-xs"
                        >
                          {isSaving ? '…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(null);
                          }}
                          className="btn-secondary btn-sm px-2 py-1 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="group/dest flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          {domain ? (
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                              alt=""
                              className="h-3.5 w-3.5 shrink-0 rounded"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Globe size={13} className="shrink-0 text-paper-500" />
                          )}
                          <a
                            href={link.originalUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-mono text-xs text-paper-400 hover:text-paper-200 hover:underline"
                            title={link.originalUrl}
                          >
                            {link.originalUrl}
                          </a>
                        </div>

                        {onUpdateDestination && (
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(link, e)}
                            className="rounded p-1 text-paper-500 opacity-0 transition-opacity hover:bg-ink-800 hover:text-accent-400 group-hover/dest:opacity-100"
                            title="Change destination link without reprinting QR"
                          >
                            <Edit3 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3.5">
                    <span className="badge-neutral capitalize text-xs">
                      {link.category || 'other'}
                    </span>
                  </td>

                  {/* Scans Count */}
                  <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-paper-100">
                    {link.clicks ?? 0}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    {link.isActive ? (
                      <span className="badge-success text-xs">Active</span>
                    ) : (
                      <span className="badge-neutral text-xs">Paused</span>
                    )}
                  </td>

                  {/* Actions Column */}
                  <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="relative inline-flex items-center gap-1">
                      {/* Customize Style in Studio */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditStyle && onEditStyle(link);
                        }}
                        className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-accent-400 transition-colors"
                        title="Customize QR Design"
                      >
                        <Sparkles size={15} />
                      </button>

                      {/* Download PNG */}
                      <button
                        type="button"
                        onClick={(e) => handleDownloadPng(link, e)}
                        className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                        title="Download PNG"
                      >
                        <Download size={15} />
                      </button>

                      {/* Analytics */}
                      <RouterLink
                        to={`/analytics/${link._id}`}
                        className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                        title="View Scan Telemetry"
                      >
                        <BarChart3 size={15} />
                      </RouterLink>

                      {/* Inspect Drawer */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspect && onInspect(link);
                        }}
                        className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                        title="Inspect QR Details"
                      >
                        <SlidersHorizontal size={15} />
                      </button>

                      {/* Dropdown Menu */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu((prev) =>
                              prev?.id === link._id ? null : { id: link._id, anchorEl: e.currentTarget }
                            );
                          }}
                          className={`rounded-lg p-1.5 transition-colors ${
                            activeMenu?.id === link._id
                              ? 'bg-ink-800 text-accent-400'
                              : 'text-paper-400 hover:bg-ink-800 hover:text-paper-100'
                          }`}
                          title="More actions"
                        >
                          <MoreHorizontal size={15} />
                        </button>

                        <ActionDropdown
                          isOpen={activeMenu?.id === link._id}
                          onClose={() => setActiveMenu(null)}
                          anchorEl={activeMenu?.anchorEl}
                          width={180}
                        >
                          {onUpdateDestination && (
                            <button
                              type="button"
                              onClick={(e) => {
                                setActiveMenu(null);
                                handleStartEdit(link, e);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
                            >
                              <Edit3 size={13} /> Change Destination
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              setActiveMenu(null);
                              onEditStyle && onEditStyle(link);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
                          >
                            <Sparkles size={13} /> Customize QR Style
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              setActiveMenu(null);
                              handleCopy(link._id, link.shortUrl, e);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
                          >
                            <Copy size={13} /> Copy Short URL
                          </button>

                          {onToggleStatus && (
                            <button
                              type="button"
                              onClick={(e) => {
                                setActiveMenu(null);
                                onToggleStatus && onToggleStatus(link);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
                            >
                              <Power size={13} /> {link.isActive ? 'Pause QR' : 'Activate QR'}
                            </button>
                          )}

                          {onDelete && (
                            <>
                              <div className="my-1 border-t border-ink-700/80" />
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenu(null);
                                  onDelete(link._id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger hover:bg-danger/10 transition-colors"
                              >
                                <Trash2 size={13} /> Delete QR
                              </button>
                            </>
                          )}
                        </ActionDropdown>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
