import { useState } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  BarChart3,
  Lock,
  ShieldAlert,
  MoreHorizontal,
  Power,
  Trash2,
  SlidersHorizontal,
  QrCode,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link as RouterLink } from 'react-router-dom';
import QRCodeModal from '../qr/QRCodeModal';
import { linkService } from '../../services';
import useLinkStore from '../../context/linkStore';
import { useConfirm } from '../../context/ConfirmContext';

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export default function LinkTableView({
  links,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onToggleStatus,
  onInspectLink,
}) {
  const confirm = useConfirm();
  const { updateLink, removeLink } = useLinkStore();
  const [copiedId, setCopiedId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [selectedQrLink, setSelectedQrLink] = useState(null);

  const allSelected = links.length > 0 && selectedIds.length === links.length;

  const handleCopy = (id, shortUrl, e) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(shortUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Copied to clipboard');
  };

  const handleToggle = async (link, e) => {
    e?.stopPropagation();
    setMenuOpenId(null);
    try {
      const data = await linkService.toggleLinkStatus(link._id);
      updateLink(data.link);
      toast.success(data.link.isActive ? 'Link activated' : 'Link paused');
    } catch (error) {
      toast.error('Failed to toggle status');
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    setMenuOpenId(null);
    const linkToDelete = links.find((l) => l._id === id);
    const confirmed = await confirm({
      title: 'Delete Short Link',
      message: 'Are you sure you want to delete this short link? This will permanently disable redirects and remove analytics.',
      confirmText: 'Delete Link',
      cancelText: 'Cancel',
      variant: 'danger',
      detail: linkToDelete ? `${linkToDelete.shortUrl} ➔ ${linkToDelete.originalUrl}` : undefined,
    });
    if (!confirmed) return;

    try {
      await linkService.deleteLink(id);
      removeLink(id);
      toast.success('Link deleted');
    } catch (error) {
      toast.error('Failed to delete link');
    }
  };

  return (
    <>
      <div className="rounded-xl border border-ink-700 bg-ink-900 shadow-panel">
      <div className="overflow-x-auto rounded-xl">
        <table className="w-full min-w-[760px] text-left text-sm text-paper-300">
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
              <th className="px-4 py-3.5">Short Link & Destination</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Category</th>
              <th className="px-4 py-3.5 text-right">Clicks / Quota</th>
              <th className="px-4 py-3.5 text-right">Created</th>
              <th className="w-32 px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700/60">
            {links.map((link, index) => {
              const isSelected = selectedIds.includes(link._id);
              const domain = getDomain(link.originalUrl);
              const isQuotaFull = link.maxClicks && (link.clicks || 0) >= link.maxClicks;
              const isExpired = link.expiryDate && new Date(link.expiryDate) < new Date();
              const isNearBottom = index >= links.length - 2;

              return (
                <tr
                  key={link._id}
                  onClick={() => onInspectLink(link)}
                  className={`group cursor-pointer transition-colors ${
                    isSelected ? 'bg-ink-800/80' : 'hover:bg-ink-800/40'
                  }`}
                >
                  {/* Select Checkbox */}
                  <td
                    className="px-4 py-3.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(link._id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded border-ink-600 bg-ink-800 text-accent-400 focus:ring-accent-400 cursor-pointer"
                    />
                  </td>

                  {/* Link Details */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      {domain ? (
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                          alt=""
                          className="mt-1 h-4 w-4 shrink-0 rounded"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="mt-1 h-4 w-4 shrink-0 rounded bg-ink-700" />
                      )}

                      <div className="min-w-0 max-w-md">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-paper-100 group-hover:text-accent-400 transition-colors">
                            {link.title || 'Untitled link'}
                          </span>
                          {link.password && (
                            <span title="Password Protected">
                              <Lock size={12} className="shrink-0 text-accent-400" />
                            </span>
                          )}
                        </div>

                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-accent-400">
                            {link.shortUrl}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(link._id, link.shortUrl, e)}
                            className="text-paper-500 hover:text-paper-100 p-0.5 rounded transition-colors"
                            title="Copy short link"
                          >
                            {copiedId === link._id ? (
                              <Check size={12} className="text-accent-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>

                        <p className="mt-0.5 truncate text-[11px] text-paper-500 font-mono">
                          {link.originalUrl}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="px-4 py-3.5">
                    {link.abuseFlag ? (
                      <span className="badge-danger text-xs">
                        <ShieldAlert size={11} /> Flagged
                      </span>
                    ) : isQuotaFull ? (
                      <span className="badge-danger text-xs font-mono">Limit Reached</span>
                    ) : isExpired ? (
                      <span className="badge-danger text-xs">Expired</span>
                    ) : link.isActive ? (
                      <span className="badge-success text-xs">Active</span>
                    ) : (
                      <span className="badge-neutral text-xs">Paused</span>
                    )}
                  </td>

                  {/* Category & Tags */}
                  <td className="px-4 py-3.5">
                    <span className="badge-neutral capitalize text-xs">
                      {link.category || 'other'}
                    </span>
                  </td>

                  {/* Clicks & Quota */}
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-sm font-semibold text-paper-100">
                        {link.clicks ?? 0}
                        {link.maxClicks ? (
                          <span className="text-xs text-paper-500 font-normal"> / {link.maxClicks}</span>
                        ) : null}
                      </span>
                      {link.maxClicks ? (
                        <span
                          className={`text-[10px] font-mono ${
                            isQuotaFull ? 'text-danger font-semibold' : 'text-paper-500'
                          }`}
                        >
                          {isQuotaFull
                            ? 'Quota full'
                            : `${Math.max(0, link.maxClicks - (link.clicks || 0))} opens left`}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* Created Date */}
                  <td className="px-4 py-3.5 text-right text-xs text-paper-400 whitespace-nowrap">
                    {new Date(link.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>

                  {/* Action Menu */}
                  <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="relative inline-flex items-center gap-1">
                      {/* Inline Quick Action: Analytics */}
                      <RouterLink
                        to={`/analytics/${link._id}`}
                        className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                        title="View analytics"
                      >
                        <BarChart3 size={15} />
                      </RouterLink>

                      {/* Inline Quick Action: Test Destination */}
                      <a
                        href={link.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                        title="Open destination"
                      >
                        <ExternalLink size={15} />
                      </a>

                      {/* Inline Quick Action: QR Code */}
                      <button
                        type="button"
                        onClick={() => setSelectedQrLink(link)}
                        className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-accent-400 transition-colors"
                        title="Customize & Download QR"
                      >
                        <QrCode size={15} />
                      </button>

                      {/* Inline Quick Action: Inspect Drawer */}
                      <button
                        type="button"
                        onClick={() => onInspectLink(link)}
                        className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                        title="Configure details (Drawer)"
                      >
                        <SlidersHorizontal size={15} />
                      </button>

                      {/* Dropdown Menu */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuOpenId(menuOpenId === link._id ? null : link._id)}
                          className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                          title="More actions"
                        >
                          <MoreHorizontal size={15} />
                        </button>

                        {menuOpenId === link._id && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setMenuOpenId(null)}
                            />
                            <div
                              className={`absolute right-0 z-40 w-40 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 py-1 shadow-2xl text-left ${
                                isNearBottom ? 'bottom-full mb-1' : 'top-full mt-1'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  handleCopy(link._id, link.shortUrl, e);
                                  setMenuOpenId(null);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-700"
                              >
                                <Copy size={13} /> Copy link
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  setSelectedQrLink(link);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-700"
                              >
                                <QrCode size={13} /> Customize QR
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleToggle(link, e)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-700"
                              >
                                <Power size={13} /> {link.isActive ? 'Pause link' : 'Activate link'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  onInspectLink(link);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-700"
                              >
                                <SlidersHorizontal size={13} /> Edit settings
                              </button>
                              <div className="my-1 border-t border-ink-700" />
                              <button
                                type="button"
                                onClick={(e) => handleDelete(link._id, e)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger hover:bg-danger/10"
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                          </>
                        )}
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

    <QRCodeModal
      open={Boolean(selectedQrLink)}
      onClose={() => setSelectedQrLink(null)}
      link={selectedQrLink}
    />
  </>
  );
}
