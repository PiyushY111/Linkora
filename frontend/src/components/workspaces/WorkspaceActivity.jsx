import { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import Skeleton from '../ui/Skeleton';
import { workspaceService } from '../../services';
import { describeActivity } from '../../utils/activityFormat';
import { downloadBlob } from '../../utils/download';

const PAGE_SIZE = 20;

/**
 * The workspace's audit log (admin+): who did what, to what, and when.
 * @param {{ workspaceId: string, workspaceName?: string }} props
 */
export default function WorkspaceActivity({ workspaceId, workspaceName = 'workspace' }) {
  const [entries, setEntries] = useState([]);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await workspaceService.exportActivity(workspaceId);
      const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';
      downloadBlob(blob, `linkora-activity-${slug}-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Activity exported');
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const fetchPage = useCallback(
    async (page) => {
      setIsLoading(true);
      try {
        const data = await workspaceService.listActivity(workspaceId, { page, limit: PAGE_SIZE });
        setEntries(data.activity || []);
        setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to load activity');
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  if (isLoading && entries.length === 0) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 py-10 text-paper-500">
        <History size={24} className="mb-2 opacity-50" />
        <p className="text-sm font-medium text-paper-300">No activity yet</p>
        <p className="mt-0.5 text-xs">Changes to links, keys, webhooks, members and settings show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-paper-500">{pagination.total} recorded changes</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExport} className="btn-secondary btn-sm" disabled={isExporting}>
            <Download size={13} className={isExporting ? 'animate-bounce' : ''} />
            {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            type="button"
            onClick={() => fetchPage(pagination.page)}
            className="rounded-lg border border-ink-700 bg-ink-900 p-1.5 text-paper-400 transition-colors hover:bg-ink-800 hover:text-paper-100"
            title="Refresh activity"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-950/60 font-semibold uppercase tracking-wider text-paper-400">
              <th className="px-3 py-2.5">Actor</th>
              <th className="px-3 py-2.5">Action</th>
              <th className="px-3 py-2.5">Target</th>
              <th className="px-3 py-2.5 text-right">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {entries.map((entry) => {
              const { label, target } = describeActivity(entry);
              const when = new Date(entry.timestamp);
              return (
                <tr key={entry.id} className="transition-colors hover:bg-ink-800/40">
                  <td className="px-3 py-2.5">
                    <p className="truncate text-paper-200">{entry.actor?.name ?? 'Deleted user'}</p>
                    {entry.actor?.email && <p className="truncate text-paper-500">{entry.actor.email}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-paper-200">{label}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 font-mono text-paper-400">{target ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-paper-500" title={when.toLocaleString()}>
                    {formatDistanceToNow(when, { addSuffix: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between border-t border-ink-700 pt-2 text-xs text-paper-400">
          <span>
            Page {pagination.page} of {pagination.pages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isLoading || pagination.page <= 1}
              onClick={() => fetchPage(pagination.page - 1)}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={isLoading || pagination.page >= pagination.pages}
              onClick={() => fetchPage(pagination.page + 1)}
              className="btn btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
