import { useState, useRef } from 'react';
import {
  Copy,
  Check,
  Trash2,
  MoreVertical,
  BarChart3,
  Power,
  Lock,
  ShieldAlert,
  ExternalLink,
  QrCode,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Link as RouterLink } from 'react-router-dom';
import QRCodeModal from './qr/QRCodeModal';
import ActionDropdown from './ui/ActionDropdown';
import { linkService } from '../services';
import useLinkStore from '../context/linkStore';
import { useConfirm } from '../context/ConfirmContext';

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export default function LinkCard({
  link,
  isSelected = false,
  onToggleSelect,
  onInspectLink,
}) {
  const confirm = useConfirm();
  const [isLoading, setIsLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const menuBtnRef = useRef(null);
  const { removeLink, updateLink } = useLinkStore();

  const domain = getDomain(link.originalUrl);

  const copyToClipboard = (e) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(link.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  const handleDelete = async (e) => {
    e?.stopPropagation();
    const confirmed = await confirm({
      title: 'Delete Short Link',
      message: 'Are you sure you want to delete this short link? The redirect URL will stop working immediately and analytics cannot be recovered.',
      confirmText: 'Delete Link',
      cancelText: 'Cancel',
      variant: 'danger',
      detail: `${link.shortUrl} ➔ ${link.originalUrl}`,
    });
    if (!confirmed) return;
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

  const handleToggle = async (e) => {
    e?.stopPropagation();
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
    <>
      <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      onClick={() => onInspectLink && onInspectLink(link)}
      className={`group panel relative cursor-pointer p-5 transition-all duration-150 hover:border-ink-500 hover:shadow-glow ${
        isSelected ? 'ring-2 ring-accent-400 border-accent-400/40 bg-ink-850' : ''
      }`}
    >
      {/* Top Bar: Checkbox + Title + Status Badges + Menu */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {onToggleSelect && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(link._id);
              }}
              className="mt-0.5"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="rounded border-ink-600 bg-ink-800 text-accent-400 focus:ring-accent-400 cursor-pointer"
              />
            </div>
          )}

          {domain ? (
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              alt=""
              className="mt-0.5 h-4 w-4 shrink-0 rounded"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          ) : (
            <div className="mt-0.5 h-4 w-4 shrink-0 rounded bg-ink-700" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-paper-100 group-hover:text-accent-400 transition-colors">
                {link.title || 'Untitled link'}
              </h3>
              {link.abuseFlag ? (
                <span className="badge-danger shrink-0 text-xs">
                  <ShieldAlert size={11} /> Flagged
                </span>
              ) : link.isActive ? (
                <span className="badge-success shrink-0 text-xs">Active</span>
              ) : (
                <span className="badge-neutral shrink-0 text-xs">Paused</span>
              )}
              {link.password && (
                <Lock size={12} className="shrink-0 text-paper-500" title="Password protected" />
              )}
            </div>

            <p className="mt-0.5 truncate text-xs text-paper-500">
              {link.originalUrl}
            </p>
          </div>
        </div>

        {/* Menu Actions */}
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className={`rounded-lg p-1.5 transition-colors ${
              showMenu ? 'bg-ink-700 text-accent-400' : 'text-paper-500 hover:bg-ink-700 hover:text-paper-100'
            }`}
            aria-label="Link actions"
          >
            <MoreVertical size={16} />
          </button>

          <ActionDropdown
            isOpen={showMenu}
            onClose={() => setShowMenu(false)}
            anchorEl={menuBtnRef.current}
            width={176}
          >
            <RouterLink
              to={`/analytics/${link._id}`}
              className="flex items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
              onClick={() => setShowMenu(false)}
            >
              <BarChart3 size={13} /> Analytics
            </RouterLink>
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                setShowQrModal(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-paper-200 hover:bg-ink-750 transition-colors"
            >
              <QrCode size={13} /> Customize QR
            </button>
            <a
              href={link.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
              onClick={() => setShowMenu(false)}
            >
              <ExternalLink size={13} /> Visit original
            </a>
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                handleToggle();
              }}
              disabled={isLoading}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-paper-200 hover:bg-ink-750 transition-colors"
            >
              <Power size={13} /> {link.isActive ? 'Pause link' : 'Activate link'}
            </button>
            <div className="my-1 border-t border-ink-700/80" />
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                handleDelete();
              }}
              disabled={isLoading}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-danger hover:bg-danger/10 transition-colors"
            >
              <Trash2 size={13} /> Delete
            </button>
          </ActionDropdown>
        </div>
      </div>

      {/* Short URL Box */}
      <div
        onClick={copyToClipboard}
        className="mt-3.5 flex w-full items-center justify-between gap-2 rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 text-left transition-colors hover:border-accent-400/50"
      >
        <span className="truncate font-mono text-xs font-semibold text-accent-400">
          {link.shortUrl}
        </span>
        <button
          type="button"
          className="text-paper-500 hover:text-paper-100 shrink-0"
          title="Copy short link"
        >
          {copied ? <Check size={14} className="text-accent-400" /> : <Copy size={14} />}
        </button>
      </div>

      {/* Bottom Row: Stats & QR Code */}
      <div className="mt-4 flex items-end justify-between">
        <div className="flex gap-5 text-sm">
          <div>
            <p className="text-xs text-paper-500">Clicks</p>
            <p className="font-mono text-lg font-bold text-paper-100">{link.clicks ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-paper-500">Created</p>
            <p className="text-xs text-paper-300 mt-1">{formatDate(link.createdAt)}</p>
          </div>
          {link.category && (
            <div>
              <p className="text-xs text-paper-500">Category</p>
              <p className="text-xs font-medium text-paper-300 mt-1 capitalize">
                {link.category}
              </p>
            </div>
          )}
        </div>

        {link.qrCode ? (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setShowQrModal(true);
            }}
            className="group/qr relative cursor-pointer shrink-0"
            title="Click to customize QR code"
          >
            <img
              src={link.qrCode}
              alt="QR code"
              className="h-10 w-10 rounded-lg bg-ink-950 p-0.5 ring-1 ring-ink-600 transition-transform group-hover/qr:scale-110"
            />
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-ink-950/70 opacity-0 group-hover/qr:opacity-100 transition-opacity">
              <Sparkles size={12} className="text-accent-400" />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowQrModal(true);
            }}
            className="rounded-lg p-1.5 text-paper-500 hover:bg-ink-700 hover:text-accent-400 transition-colors"
            title="Create Custom QR"
          >
            <QrCode size={16} />
          </button>
        )}
      </div>

      {/* Tags */}
      {link.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-800 pt-3">
          {link.tags.map((tag) => (
            <span key={tag} className="badge-neutral text-[11px]">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>

    <QRCodeModal
      open={showQrModal}
      onClose={() => setShowQrModal(false)}
      link={link}
    />
  </>
  );
}
