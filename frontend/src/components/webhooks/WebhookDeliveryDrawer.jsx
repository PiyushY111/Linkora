import { useState, useEffect, useCallback } from 'react';
import { Activity, ChevronDown, ChevronUp, Clock, RefreshCw, RotateCw, History } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { webhookService } from '../../services';
import { eventMeta, deliveryStatusMeta, deliveryStatusLabel, formatDateTime } from './webhookFormat';
import WebhookDeliveryDetail from './WebhookDeliveryDetail';
import { useConfirm } from '../../context/ConfirmContext';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'succeeded', label: 'Delivered' },
  { value: 'pending', label: 'Retrying' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAGE_SIZE = 15;
const BULK_REPLAY_WINDOW_HOURS = 24;

const WebhookDeliveryDrawer = ({ open, onClose, webhook, onChanged }) => {
  const confirm = useConfirm();
  const [deliveries, setDeliveries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, totalCount: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});
  const [replayingId, setReplayingId] = useState(null);
  const [isBulkReplaying, setIsBulkReplaying] = useState(false);

  const fetchDeliveries = useCallback(
    async (page = 1) => {
      if (!webhook) return;
      setIsLoading(true);
      try {
        const params = { page, limit: PAGE_SIZE, ...(statusFilter && { status: statusFilter }) };
        const res = await webhookService.listDeliveries(webhook._id, params);
        setDeliveries(res.deliveries || []);
        setPagination(res.pagination || { page: 1, pages: 1, totalCount: 0 });
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load deliveries');
      } finally {
        setIsLoading(false);
      }
    },
    [webhook, statusFilter]
  );

  useEffect(() => {
    if (open && webhook) {
      fetchDeliveries(1);
    } else {
      setDeliveries([]);
      setExpandedId(null);
      setDetails({});
    }
  }, [open, webhook, fetchDeliveries]);

  const toggleExpanded = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    try {
      const res = await webhookService.getDelivery(webhook._id, id);
      setDetails((prev) => ({ ...prev, [id]: res.delivery }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load delivery');
    }
  };

  const handleReplay = async (deliveryId) => {
    setReplayingId(deliveryId);
    try {
      const { delivery } = await webhookService.replayDelivery(webhook._id, deliveryId);
      const status = delivery?.lastResponseStatus ? `HTTP ${delivery.lastResponseStatus}` : delivery?.lastError || 'no response';
      if (delivery?.status === 'succeeded') toast.success(`Replay delivered (${status})`);
      else toast.error(`Replay failed (${status}); it will keep retrying on schedule`);
      await fetchDeliveries(pagination.page);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to replay delivery');
    } finally {
      setReplayingId(null);
    }
  };

  const handleBulkReplay = async () => {
    const confirmed = await confirm({
      title: 'Replay failed deliveries',
      message: `Queue a fresh delivery for every failed or cancelled event to this endpoint from the last ${BULK_REPLAY_WINDOW_HOURS} hours? Each keeps its original event id, so receivers can de-duplicate.`,
      confirmText: 'Replay',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!confirmed) return;

    setIsBulkReplaying(true);
    try {
      const since = new Date(Date.now() - BULK_REPLAY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const res = await webhookService.replayFailed(webhook._id, { since, includeCancelled: true });
      toast.success(
        res.queued === 0
          ? 'Nothing to replay'
          : `Queued ${res.queued} replay${res.queued === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} expired)` : ''}`
      );
      await fetchDeliveries(1);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to queue replays');
    } finally {
      setIsBulkReplaying(false);
    }
  };

  if (!webhook) return null;

  return (
    <Modal open={open} onClose={onClose} title="Webhook Deliveries" maxWidth="max-w-4xl">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-ink-700 pb-3">
          <div className="min-w-0">
            <span className="font-mono text-xs text-paper-400">Target: </span>
            <span className="font-mono text-xs text-paper-200 break-all">{webhook.url}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-ink-700 bg-ink-950 p-0.5" role="group" aria-label="Filter by status">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value || 'all'}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  aria-pressed={statusFilter === f.value}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === f.value ? 'bg-ink-800 text-paper-100 shadow-sm' : 'text-paper-400 hover:text-paper-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleBulkReplay}
              disabled={isBulkReplaying}
              className="btn btn-secondary btn-sm"
              title={`Replay failed and cancelled deliveries from the last ${BULK_REPLAY_WINDOW_HOURS}h`}
            >
              {isBulkReplaying ? <RotateCw size={13} className="animate-spin" /> : <History size={13} />}
              <span>Replay failed</span>
            </button>
            <button
              type="button"
              onClick={() => fetchDeliveries(pagination.page)}
              className="rounded-lg border border-ink-700 bg-ink-900 p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
              title="Refresh"
              aria-label="Refresh deliveries"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="min-h-[250px] max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {isLoading && deliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-paper-400 gap-2">
              <RotateCw size={24} className="animate-spin text-accent-400" />
              <span className="text-xs">Loading deliveries…</span>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-paper-500 rounded-xl border border-dashed border-ink-700">
              <Activity size={28} className="mb-2 opacity-50" />
              <p className="text-sm font-medium text-paper-300">No deliveries</p>
              <p className="text-xs text-paper-500 mt-0.5">
                {statusFilter ? 'None match this filter.' : 'Events sent to this endpoint show up here.'}
              </p>
            </div>
          ) : (
            deliveries.map((item) => {
              const status = deliveryStatusMeta(item.status);
              const meta = eventMeta(item.eventType);
              const isExpanded = expandedId === item._id;
              return (
                <div key={item._id} className="rounded-xl border border-ink-700/80 bg-ink-900 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(item._id)}
                    aria-expanded={isExpanded}
                    className="flex w-full flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-2 text-left hover:bg-ink-800/60 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ${status.dot}`} />
                      <span className={`text-xs font-semibold ${status.text}`}>{deliveryStatusLabel(item)}</span>
                      <span className={`badge text-[11px] font-mono border ${meta.color}`}>{item.eventType}</span>
                      {item.kind !== 'live' && (
                        <span className="badge text-[10px] bg-ink-800 text-paper-400 border border-ink-700">{item.kind}</span>
                      )}
                      <span className="font-mono text-xs text-paper-300">
                        {item.lastResponseStatus ? `HTTP ${item.lastResponseStatus}` : ''}
                      </span>
                      {item.attemptCount > 1 && (
                        <span className="text-[10px] text-paper-500">
                          {item.attemptCount}/{item.maxAttempts} attempts
                        </span>
                      )}
                      {item.lastError && item.status !== 'succeeded' && (
                        <span className="hidden md:inline-block max-w-[260px] truncate text-[11px] text-rose-300/80 font-mono" title={item.lastError}>
                          {item.lastError}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {item.lastLatencyMs !== null && item.lastLatencyMs !== undefined && (
                        <span className="flex items-center gap-1 font-mono text-xs text-paper-400">
                          <Clock size={12} />
                          {item.lastLatencyMs}ms
                        </span>
                      )}
                      <span className="text-xs text-paper-500">{formatDateTime(item.createdAt, { seconds: true })}</span>
                      {isExpanded ? <ChevronUp size={15} className="text-paper-400" /> : <ChevronDown size={15} className="text-paper-400" />}
                    </div>
                  </button>

                  {isExpanded &&
                    (details[item._id] ? (
                      <WebhookDeliveryDetail
                        delivery={details[item._id]}
                        onReplay={() => handleReplay(item._id)}
                        isReplaying={replayingId === item._id}
                      />
                    ) : (
                      <div className="border-t border-ink-700 p-4 text-xs text-paper-500">Loading…</div>
                    ))}
                </div>
              );
            })
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-ink-700 text-xs text-paper-400">
            <span>
              Page {pagination.page} of {pagination.pages} ({pagination.totalCount} deliveries)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => fetchDeliveries(pagination.page - 1)}
                className="btn btn-secondary btn-sm"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.pages}
                onClick={() => fetchDeliveries(pagination.page + 1)}
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
