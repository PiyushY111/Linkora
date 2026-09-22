import { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  Send,
  Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { webhookService } from '../../services';
import { EVENT_LABELS } from './WebhookCard';

const WebhookDeliveryDrawer = ({ open, onClose, webhook }) => {
  const [deliveries, setDeliveries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, totalCount: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const fetchDeliveries = async (page = 1, status = statusFilter) => {
    if (!webhook) return;
    setIsLoading(true);
    try {
      const params = { page, limit: 15 };
      if (status) params.status = status;
      const res = await webhookService.listDeliveries(webhook._id, params);
      setDeliveries(res.deliveries || []);
      setPagination(res.pagination || { page: 1, pages: 1, totalCount: 0 });
    } catch (err) {
      toast.error('Failed to load delivery logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && webhook) {
      fetchDeliveries(1, statusFilter);
    } else {
      setDeliveries([]);
      setExpandedId(null);
    }
  }, [open, webhook, statusFilter]);

  const handleRetry = async (deliveryId) => {
    if (!webhook) return;
    setRetryingId(deliveryId);
    try {
      const res = await webhookService.retryDelivery(webhook._id, deliveryId);
      if (res.result?.delivery?.status === 'success') {
        toast.success(`Retry delivered successfully (HTTP ${res.result.delivery.responseStatus})`);
      } else {
        toast.error(`Retry attempt failed (HTTP ${res.result?.delivery?.responseStatus || 'Error'})`);
      }
      fetchDeliveries(pagination.page, statusFilter);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to retry delivery');
    } finally {
      setRetryingId(null);
    }
  };

  const copyText = (val, key) => {
    navigator.clipboard.writeText(typeof val === 'string' ? val : JSON.stringify(val, null, 2));
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!webhook) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Webhook Delivery Logs"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Subtitle & Filter Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-ink-700 pb-3">
          <div>
            <span className="font-mono text-xs text-paper-400">Target: </span>
            <span className="font-mono text-xs text-paper-200">{webhook.url}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter buttons */}
            <div className="inline-flex rounded-lg border border-ink-700 bg-ink-950 p-0.5">
              <button
                type="button"
                onClick={() => setStatusFilter('')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === ''
                    ? 'bg-ink-800 text-paper-100 shadow-sm'
                    : 'text-paper-400 hover:text-paper-200'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('success')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === 'success'
                    ? 'bg-ink-800 text-accent-400 shadow-sm'
                    : 'text-paper-400 hover:text-paper-200'
                }`}
              >
                Success
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('failed')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === 'failed'
                    ? 'bg-ink-800 text-rose-400 shadow-sm'
                    : 'text-paper-400 hover:text-paper-200'
                }`}
              >
                Failed
              </button>
            </div>

            <button
              type="button"
              onClick={() => fetchDeliveries(pagination.page, statusFilter)}
              className="rounded-lg border border-ink-700 bg-ink-900 p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
              title="Refresh logs"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Connection Notice banner */}
        {(webhook.consecutiveFailures > 0 ||
          deliveries.some(
            (d) =>
              d.error?.includes('Connection refused') ||
              d.error?.includes('ECONNREFUSED')
          )) && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-400" />
            <div>
              <span className="font-semibold">Endpoint Server Not Reachable:</span>{' '}
              Deliveries to{' '}
              <code className="font-mono bg-ink-900 px-1 py-0.5 rounded text-amber-200">
                {webhook.url}
              </code>{' '}
              are failing because no server is currently listening on this address/port.
              <div className="mt-1 text-paper-300">
                To test successfully with zero setup, edit this endpoint URL to use Linkly&apos;s built-in Echo receiver:
                <div className="font-mono bg-ink-950 border border-ink-700 px-2 py-1 rounded text-accent-400 mt-1 select-all">
                  http://127.0.0.1:5001/api/webhooks/debug/echo
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Deliveries List */}
        <div className="min-h-[250px] max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-paper-400 gap-2">
              <RotateCw size={24} className="animate-spin text-accent-400" />
              <span className="text-xs">Fetching delivery logs…</span>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-paper-500 rounded-xl border border-dashed border-ink-700">
              <Activity size={28} className="mb-2 opacity-50" />
              <p className="text-sm font-medium text-paper-300">No delivery logs found</p>
              <p className="text-xs text-paper-500 mt-0.5">
                {statusFilter
                  ? `No logs match status "${statusFilter}"`
                  : 'Events dispatched to this endpoint will show up here.'}
              </p>
            </div>
          ) : (
            deliveries.map((item) => {
              const is2xx = item.status === 'success';
              const isExpanded = expandedId === item._id;
              const eventMeta = EVENT_LABELS[item.event] || {
                label: item.event,
                color: 'bg-ink-800 text-paper-300 border-ink-600',
              };

              return (
                <div
                  key={item._id}
                  className="rounded-xl border border-ink-700/80 bg-ink-900 overflow-hidden transition-colors"
                >
                  {/* Row Summary */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : item._id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-2 cursor-pointer hover:bg-ink-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {is2xx ? (
                        <CheckCircle2 size={16} className="text-accent-400 shrink-0" />
                      ) : (
                        <XCircle size={16} className="text-rose-400 shrink-0" />
                      )}

                      <span
                        className={`badge text-[11px] font-mono border ${eventMeta.color}`}
                      >
                        {item.event}
                      </span>

                      <span
                        className={`font-mono text-xs font-semibold ${
                          is2xx ? 'text-accent-400' : 'text-rose-400'
                        }`}
                      >
                        {item.responseStatus ? `HTTP ${item.responseStatus}` : 'Failed'}
                      </span>

                      {item.attempt > 1 && (
                        <span className="badge text-[10px] bg-ink-800 text-paper-400 border border-ink-700">
                          Attempt #{item.attempt}
                        </span>
                      )}

                      {!is2xx && item.error && (
                        <span className="hidden sm:inline-block max-w-[180px] md:max-w-[280px] truncate text-[11px] text-rose-300/80 font-mono" title={item.error}>
                          {item.error}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-7 sm:ml-0">
                      <div className="flex items-center gap-1 font-mono text-xs text-paper-400">
                        <Clock size={12} />
                        <span>{item.latencyMs || 0}ms</span>
                      </div>

                      <span className="text-xs text-paper-500">
                        {new Date(item.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>

                      {isExpanded ? <ChevronUp size={15} className="text-paper-400" /> : <ChevronDown size={15} className="text-paper-400" />}
                    </div>
                  </div>

                  {/* Expanded Inspector Accordion */}
                  {isExpanded && (
                    <div className="border-t border-ink-700 bg-ink-950/60 p-4 space-y-4">
                      {/* Top Action Ribbon */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-paper-400">
                          Delivery Details
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetry(item._id);
                          }}
                          disabled={retryingId === item._id}
                          className="btn btn-secondary btn-sm text-paper-100 hover:text-accent-400 hover:border-accent-400/40"
                        >
                          {retryingId === item._id ? (
                            <>
                              <RotateCw size={12} className="animate-spin" />
                              <span>Retrying…</span>
                            </>
                          ) : (
                            <>
                              <Send size={12} />
                              <span>Replay / Retry Delivery</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Error Alert if present */}
                      {item.error && (
                        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                          <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          <span>{item.error}</span>
                        </div>
                      )}

                      {/* Request Headers & Signature */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-medium text-paper-400 mb-1">
                          <span>REQUEST HEADERS</span>
                          <button
                            type="button"
                            onClick={() => copyText(item.requestHeaders, `hdr_${item._id}`)}
                            className="inline-flex items-center gap-1 hover:text-accent-400 text-paper-500 text-[11px]"
                          >
                            {copiedKey === `hdr_${item._id}` ? (
                              <Check size={11} className="text-accent-400" />
                            ) : (
                              <Copy size={11} />
                            )}
                            <span>Copy Headers</span>
                          </button>
                        </div>
                        <pre className="max-h-24 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[11px] text-paper-300">
                          {item.requestHeaders
                            ? Object.entries(item.requestHeaders)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join('\n')
                            : 'None recorded'}
                        </pre>
                      </div>

                      {/* Request Payload */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-medium text-paper-400 mb-1">
                          <span>REQUEST PAYLOAD</span>
                          <button
                            type="button"
                            onClick={() => copyText(item.requestPayload, `payload_${item._id}`)}
                            className="inline-flex items-center gap-1 hover:text-accent-400 text-paper-500 text-[11px]"
                          >
                            {copiedKey === `payload_${item._id}` ? (
                              <Check size={11} className="text-accent-400" />
                            ) : (
                              <Copy size={11} />
                            )}
                            <span>Copy JSON</span>
                          </button>
                        </div>
                        <pre className="max-h-36 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[11px] text-paper-200 selection:bg-accent-400 selection:text-ink-950">
                          {JSON.stringify(item.requestPayload, null, 2)}
                        </pre>
                      </div>

                      {/* Response Body Preview */}
                      <div>
                        <div className="text-[11px] font-medium text-paper-400 mb-1">
                          RESPONSE BODY
                        </div>
                        <pre className="max-h-28 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[11px] text-paper-300">
                          {item.responseBody || '(No response body)'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pagination controls */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-ink-700 text-xs text-paper-400">
            <span>
              Showing Page {pagination.page} of {pagination.pages} ({pagination.totalCount} records)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => fetchDeliveries(pagination.page - 1, statusFilter)}
                className="btn btn-secondary btn-sm"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.pages}
                onClick={() => fetchDeliveries(pagination.page + 1, statusFilter)}
                className="btn btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default WebhookDeliveryDrawer;
