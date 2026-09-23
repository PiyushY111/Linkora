import { useState, useRef } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  BarChart3,
  Download,
  Trash2,
  Power,
  MoreVertical,
  Edit3,
  Sparkles,
  Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link as RouterLink } from 'react-router-dom';
import ActionDropdown from '../ui/ActionDropdown';

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export default function QRCard({
  link,
  isSelected = false,
  onToggleSelect,
  onInspect,
  onEditStyle,
  onToggleStatus,
  onDelete,
  onUpdateDestination,
}) {
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editUrl, setEditUrl] = useState(link.originalUrl);
  const [isSaving, setIsSaving] = useState(false);
  const menuBtnRef = useRef(null);

  const domain = getDomain(link.originalUrl);

  const handleCopy = (e) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(link.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied to clipboard');
  };

  const handleSaveDestination = async (e) => {
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
      await onUpdateDestination(link._id, normalized);
      setIsEditing(false);
      toast.success('Destination updated! Scanners will now redirect to the new URL.');
    } catch {
      toast.error('Failed to update destination');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = (e) => {
    e?.stopPropagation();
    if (!link.qrCode) {
      toast.error('No QR image available');
      return;
    }
    const a = document.createElement('a');
    a.href = link.qrCode;
    a.download = `${link.shortCode || 'qr'}-asset.png`;
    a.click();
    toast.success('Downloaded PNG');
  };

  return (
    <div
      onClick={() => onInspect && onInspect(link)}
      className={`group panel relative flex flex-col justify-between p-5 cursor-pointer transition-all duration-150 hover:border-ink-500 hover:shadow-glow ${
        isSelected ? 'ring-2 ring-accent-400 border-accent-400/40 bg-ink-850' : ''
      }`}
    >
      <div>
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={isSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelect(link._id)}
                className="mt-1 rounded border-ink-600 bg-ink-800 text-accent-400 focus:ring-accent-400 cursor-pointer"
              />
            )}
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-paper-100 group-hover:text-accent-400 transition-colors">
                {link.title || `/${link.shortCode}`}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="badge-accent text-[10px] font-mono">Dynamic</span>
                <span className="text-[11px] font-mono text-paper-400">
                  {link.clicks ?? 0} scans
                </span>
              </div>
            </div>
          </div>

          <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              ref={menuBtnRef}
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className={`rounded-lg p-1.5 transition-colors ${
                showMenu ? 'bg-ink-750 text-accent-400' : 'text-paper-500 hover:bg-ink-700 hover:text-paper-100'
              }`}
            >
              <MoreVertical size={15} />
            </button>

            <ActionDropdown
              isOpen={showMenu}
              onClose={() => setShowMenu(false)}
              anchorEl={menuBtnRef.current}
              width={180}
            >
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setIsEditing(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
              >
                <Edit3 size={13} /> Change Destination
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onEditStyle && onEditStyle(link);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
              >
                <Sparkles size={13} /> Customize QR Style
              </button>

              <RouterLink
                to={`/analytics/${link._id}`}
                className="flex items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <BarChart3 size={13} /> View Analytics
              </RouterLink>

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onToggleStatus && onToggleStatus(link);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 transition-colors"
              >
                <Power size={13} /> {link.isActive ? 'Pause QR' : 'Activate QR'}
              </button>

              <div className="my-1 border-t border-ink-700/80" />

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onDelete && onDelete(link._id);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 size={13} /> Delete QR
              </button>
            </ActionDropdown>
          </div>
        </div>

        {/* QR Centerpiece Stage */}
        <div className="my-4 flex justify-center">
          <div
            onClick={(e) => {
              e.stopPropagation();
              onEditStyle && onEditStyle(link);
            }}
            className="group/img relative h-40 w-40 cursor-pointer overflow-hidden rounded-2xl bg-ink-950 p-2.5 ring-1 ring-ink-700 shadow-inner transition-transform group-hover/img:scale-105 group-hover/img:ring-accent-400/50"
            title="Click to customize design"
          >
            <img
              src={
                link.qrCode ||
                `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  link.shortUrl
                )}`
              }
              alt="QR Code"
              className="h-full w-full object-contain"
            />
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-ink-950/70 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <Sparkles size={18} className="text-accent-400" />
            </div>
          </div>
        </div>

        {/* Short Code Display */}
        <div className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-950/80 px-2.5 py-1.5 text-xs font-mono">
          <span className="truncate text-accent-400 font-semibold">{link.shortUrl}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded p-1 text-paper-500 hover:text-paper-200 transition-colors"
              title="Copy short link"
            >
              {copied ? <Check size={12} className="text-accent-400" /> : <Copy size={12} />}
            </button>
            <a
              href={link.shortUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-paper-500 hover:text-paper-200 transition-colors"
              title="Test scan redirect"
            >
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Destination Target (with inline edit) */}
        <div className="mt-3 rounded-lg border border-ink-700/60 bg-ink-950/40 p-2.5 space-y-1" onClick={(e) => isEditing && e.stopPropagation()}>
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold uppercase tracking-wider text-paper-400">
              Redirects Scanners To
            </span>
            {!isEditing && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="flex items-center gap-1 text-accent-400 hover:underline"
              >
                <Edit3 size={10} />
                <span>Change</span>
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://new-url.com"
                className="input font-mono text-xs py-1"
                autoFocus
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleSaveDestination}
                  disabled={isSaving}
                  className="btn-primary btn-sm flex-1 text-xs py-1"
                >
                  {isSaving ? '…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="btn-secondary btn-sm text-xs py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 truncate text-xs font-mono text-paper-300">
              {domain ? (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                  alt=""
                  className="h-3 w-3 shrink-0 rounded"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <Globe size={11} className="shrink-0 text-paper-500" />
              )}
              <a
                href={link.originalUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="truncate hover:text-paper-100 hover:underline"
                title={link.originalUrl}
              >
                {link.originalUrl}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditStyle && onEditStyle(link);
          }}
          className="btn-secondary btn-sm text-xs"
        >
          <Sparkles size={12} />
          <span>Style QR</span>
        </button>

        <div className="flex items-center gap-1.5">
          <RouterLink
            to={`/analytics/${link._id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
            title="Scan analytics"
          >
            <BarChart3 size={14} />
          </RouterLink>

          <button
            type="button"
            onClick={handleDownload}
            className="btn-primary btn-sm text-xs px-2.5"
            title="Download PNG"
          >
            <Download size={12} />
            <span>PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
}
