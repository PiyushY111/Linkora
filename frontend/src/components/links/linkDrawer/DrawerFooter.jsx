import { Link as RouterLink } from 'react-router-dom';
import { Trash2, BarChart3 } from 'lucide-react';

/** Delete and open-analytics actions. */
export default function DrawerFooter({ link, isUpdating, onDelete }) {
  return (
    <div className="border-t border-ink-700 p-4 bg-ink-950 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onDelete}
        disabled={isUpdating}
        className="btn-danger btn-sm"
      >
        <Trash2 size={13} />
        <span>Delete</span>
      </button>
      <RouterLink
        to={`/analytics/${link._id}`}
        className="btn-primary btn-sm flex items-center gap-1.5"
      >
        <BarChart3 size={13} />
        <span>Open Analytics</span>
      </RouterLink>
    </div>
  );
}
