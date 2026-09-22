import { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  RefreshCw,
  AlertTriangle,
  Globe,
  Terminal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { developerService } from '../../services';

const METHOD_COLORS = {
  GET: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  POST: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  PATCH: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  DELETE: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const ApiLogsViewer = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [statusCodeFilter, setStatusCodeFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async (page = 1, status = statusCodeFilter) => {
    setIsLoading(true);
    try {
      const params = { page, limit: 20 };
      if (status) params.statusCode = status;
      const res = await developerService.listLogs(params);
      setLogs(res.logs || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch {
      toast.error('Failed to load API request logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, statusCodeFilter);
  }, [statusCodeFilter]);

  return (
    <div className="panel p-5 space-y-4 border border-ink-700">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-ink-700 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-paper-100">Live API Request Logs</h2>
          <p className="text-xs text-paper-500">
            Real-time audit log of all inbound API requests authenticated with your API keys.
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-ink-700 bg-ink-950 p-0.5">
            {[
              { id: '', label: 'All' },
              { id: '2xx', label: '2xx Success' },
              { id: '4xx', label: '4xx Client' },
              { id: '429', label: '429 Throttled' },
              { id: '5xx', label: '5xx Server' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusCodeFilter(f.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusCodeFilter === f.id
                    ? 'bg-ink-800 text-paper-100 shadow-sm'
                    : 'text-paper-400 hover:text-paper-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => fetchLogs(pagination.page, statusCodeFilter)}
            className="rounded-lg border border-ink-700 bg-ink-900 p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
            title="Refresh logs"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="min-h-[250px] overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-paper-400 gap-2">
            <RotateCw size={24} className="animate-spin text-accent-400" />
            <span className="text-xs">Fetching request stream…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-paper-500 rounded-xl border border-dashed border-ink-700">
            <Activity size={28} className="mb-2 opacity-50" />
            <p className="text-sm font-medium text-paper-300">No request logs recorded</p>
            <p className="text-xs text-paper-500 mt-0.5">
              Make an API call using your API key or the Playground to see real-time requests here.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-950/60 font-semibold uppercase tracking-wider text-paper-400">
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Method &amp; Path</th>
                <th className="px-3 py-2.5">Key Prefix</th>
                <th className="px-3 py-2.5">Latency</th>
                <th className="px-3 py-2.5">Client IP</th>
                <th className="px-3 py-2.5 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {logs.map((log) => {
                const is2xx = log.statusCode >= 200 && log.statusCode < 300;
                return (
                  <tr key={log._id} className="hover:bg-ink-800/40 transition-colors">
                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 font-mono font-bold text-xs ${
                          is2xx
                            ? 'text-accent-400'
                            : log.statusCode === 429
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {is2xx ? (
                          <CheckCircle2 size={13} className="text-accent-400" />
                        ) : (
                          <XCircle size={13} className="text-rose-400" />
                        )}
                        <span>{log.statusCode}</span>
                      </span>
                    </td>

                    {/* Method & Path */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge text-[10px] font-mono font-bold border ${
                            METHOD_COLORS[log.method] || 'bg-ink-800 text-paper-300 border-ink-700'
                          }`}
                        >
                          {log.method}
                        </span>
                        <span className="font-mono text-paper-200 text-xs truncate max-w-xs">
                          {log.endpoint}
                        </span>
                      </div>
                      {log.errorMessage && (
                        <div className="text-[11px] text-rose-300/90 font-mono mt-0.5">
                          {log.errorMessage}
                        </div>
                      )}
                    </td>

                    {/* Key Prefix */}
                    <td className="px-3 py-2.5 font-mono text-paper-400 text-[11px]">
                      {log.apiKeyPrefix || 'legacy'}…
                    </td>

                    {/* Latency */}
                    <td className="px-3 py-2.5 font-mono text-paper-300 text-[11px]">
                      {log.latencyMs}ms
                    </td>

                    {/* IP */}
                    <td className="px-3 py-2.5 font-mono text-paper-400 text-[11px]">
                      {log.ipAddress || '—'}
                    </td>

                    {/* Time */}
                    <td className="px-3 py-2.5 text-right text-paper-500 text-[11px]">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-ink-700 text-xs text-paper-400">
          <span>
            Page {pagination.page} of {pagination.pages} ({pagination.total} records)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => fetchLogs(pagination.page - 1, statusCodeFilter)}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.pages}
              onClick={() => fetchLogs(pagination.page + 1, statusCodeFilter)}
              className="btn btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiLogsViewer;
