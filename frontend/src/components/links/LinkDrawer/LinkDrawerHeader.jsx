import { X, Power, ShieldAlert } from 'lucide-react';
import { getLinkStatus } from './linkDrawerHelpers';

function StatusBadge({ link }) {
  switch (getLinkStatus(link)) {
    case 'flagged':
      return (
        <span className="badge-danger text-xs">
          <ShieldAlert size={12} /> Flagged
        </span>
      );
    case 'limit':
      return <span className="badge-danger text-xs font-mono">Limit Reached</span>;
    case 'expired':
      return <span className="badge-danger text-xs">Expired</span>;
    case 'active':
      return <span className="badge-success text-xs">Active</span>;
    default:
      return <span className="badge-neutral text-xs">Paused</span>;
  }
}

export default function LinkDrawerHeader({ link, isUpdating, onToggle, onClose }) {
  return (
    <div className="p-5 border-b border-ink-700 bg-ink-950/70">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusBadge link={link} />
          <span className="font-mono text-xs text-paper-400">/{link.shortCode}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggle}
            disabled={isUpdating}
            className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
            title={link.isActive ? 'Pause link' : 'Activate link'}
          >
            <Power size={16} className={link.isActive ? 'text-success' : 'text-paper-500'} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="mt-4">
        <h2 className="text-lg font-bold text-paper-100 truncate">{link.title || 'Untitled Link'}</h2>
        <p className="text-xs text-paper-500 truncate mt-0.5">
          Created on{' '}
          {new Date(link.createdAt).toLocaleDateString(undefined, {
            dateStyle: 'long',
          })}
        </p>
      </div>
    </div>
  );
}
