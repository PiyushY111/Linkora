import { useState } from 'react';
import {
  Activity,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Key,
  Trash2,
  Edit3,
  Copy,
  Check,
  RotateCw,
  Power,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const EVENT_LABELS = {
  'link.created': { label: 'Link Created', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  'link.clicked': { label: 'Link Clicked', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  'link.updated': { label: 'Link Updated', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  'link.deleted': { label: 'Link Deleted', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  'link.limit_reached': { label: 'Limit Reached', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  'link.expired': { label: 'Link Expired', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  'security.abuse_flagged': { label: 'Abuse Flagged', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  'endpoint.test': { label: 'Test Ping', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

const WebhookCard = ({
  webhook,
  onTest,
  onViewLogs,
  onEdit,
  onDelete,
  onRotateSecret,
  onToggleActive,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    toast.success('Endpoint URL copied');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const isHealthy = webhook.isActive && (webhook.consecutiveFailures || 0) === 0;
  const isDegraded = webhook.isActive && (webhook.consecutiveFailures || 0) > 0;
  const isAutoDisabled = !webhook.isActive && webhook.disabledAt;

  const successRate = webhook.health?.successRate ?? 100;
  const total24h = webhook.health?.totalDeliveries24h ?? 0;
  const recentDots = webhook.health?.recentDeliveries || [];

  return (
    <div className="panel relative overflow-hidden transition-all duration-200 hover:border-ink-500/70">
      {/* Status strip */}
      <div
        className={`absolute top-0 left-0 right-0 h-0.5 ${
          !webhook.isActive
            ? 'bg-ink-600'
            : isDegraded
            ? 'bg-amber-400'
            : 'bg-accent-400'
        }`}
      />

      <div className="p-5 sm:p-6 space-y-4">
        {/* Header: Title / Description & Status Badges */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span
                className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${
                  !webhook.isActive
                    ? 'bg-paper-500'
                    : isDegraded
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-accent-400'
                }`}
              >
                {webhook.isActive && !isDegraded && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-60" />
                )}
              </span>
              <span className="font-semibold text-paper-100 truncate text-base">
                {webhook.description || 'Webhook Endpoint'}
              </span>
              <span
                className={`badge text-[11px] font-medium border ${
                  !webhook.isActive
                    ? 'bg-ink-800 text-paper-400 border-ink-600'
                    : isDegraded
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-accent-400/10 text-accent-400 border-accent-400/25'
                }`}
              >
                {!webhook.isActive
                  ? isAutoDisabled
                    ? 'Auto-Disabled (Circuit Broken)'
                    : 'Disabled'
                  : isDegraded
                  ? `Degraded (${webhook.consecutiveFailures} failures)`
                  : 'Operational'}
              </span>
            </div>
          </div>

          {/* Actions top-right */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onTest(webhook)}
              className="btn btn-secondary btn-sm text-paper-200 hover:text-accent-400 hover:border-accent-400/40"
              title="Send test ping"
            >
              <Send size={13} />
              <span>Test</span>
            </button>

            <button
              type="button"
              onClick={() => onViewLogs(webhook)}
              className="btn btn-secondary btn-sm text-paper-200 hover:text-paper-100"
              title="View delivery history"
            >
              <Activity size={13} />
              <span>Deliveries</span>
            </button>

            <button
              type="button"
              onClick={() => onEdit(webhook)}
              className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
              title="Edit endpoint"
              aria-label="Edit webhook"
            >
              <Edit3 size={15} />
            </button>

            <button
              type="button"
              onClick={() => onRotateSecret(webhook)}
              className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-amber-400 transition-colors"
              title="Rotate signing secret"
              aria-label="Rotate secret"
            >
              <Key size={15} />
            </button>

            <button
              type="button"
              onClick={() => onToggleActive(webhook)}
              className={`rounded-lg p-1.5 transition-colors ${
                webhook.isActive
                  ? 'text-paper-400 hover:bg-ink-800 hover:text-rose-400'
                  : 'text-paper-500 hover:bg-ink-800 hover:text-accent-400'
              }`}
              title={webhook.isActive ? 'Disable endpoint' : 'Enable endpoint'}
              aria-label="Toggle active"
            >
              <Power size={15} />
            </button>

            <button
              type="button"
              onClick={() => onDelete(webhook._id)}
              className="rounded-lg p-1.5 text-paper-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
              title="Delete webhook"
              aria-label="Delete webhook"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* URL Bar with Copy */}
        <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950/80 px-3 py-2 font-mono text-xs text-paper-200">
          <span className="shrink-0 text-paper-500 select-none">POST</span>
          <span className="truncate flex-1 text-paper-100 selection:bg-accent-400 selection:text-ink-950">
            {webhook.url}
          </span>
          <button
            type="button"
            onClick={() => copyToClipboard(webhook.url)}
            className="shrink-0 rounded p-1 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
            title="Copy endpoint URL"
          >
            {copiedUrl ? <Check size={13} className="text-accent-400" /> : <Copy size={13} />}
          </button>
        </div>

        {/* Health & Telemetry Metrics Strip */}
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-ink-700/60 bg-ink-950/40 p-3 sm:grid-cols-3">
          {/* 24h Success Rate */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              24h Success Rate
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-paper-100">
                {total24h === 0 ? 'No sends' : `${successRate}%`}
              </span>
              {total24h > 0 && (
                <span className="text-[11px] text-paper-400">
                  ({webhook.health?.successful24h || 0}/{total24h})
                </span>
              )}
            </div>
            {total24h > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
                <div
                  className={`h-full transition-all ${
                    successRate >= 95
                      ? 'bg-accent-400'
                      : successRate >= 80
                      ? 'bg-amber-400'
                      : 'bg-rose-400'
                  }`}
                  style={{ width: `${successRate}%` }}
                />
              </div>
            )}
          </div>

          {/* Recent Deliveries Pulse Dots */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              Recent Deliveries
            </span>
            <div className="flex items-center gap-1.5 pt-1">
              {recentDots.length === 0 ? (
                <span className="text-xs text-paper-500">No recent logs</span>
              ) : (
                recentDots.map((d) => {
                  const is2xx = d.responseStatus >= 200 && d.responseStatus < 300;
                  return (
                    <div
                      key={d._id}
                      className={`h-2.5 w-2.5 rounded-full ring-1 ring-inset ${
                        is2xx
                          ? 'bg-accent-400 ring-accent-400/40'
                          : 'bg-rose-500 ring-rose-500/40'
                      }`}
                      title={`${d.event} → HTTP ${d.responseStatus || 'Failed'} (${d.latencyMs || 0}ms)`}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Last Activity */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              Last Delivery
            </span>
            <div className="flex items-center gap-1 text-xs text-paper-300">
              <Clock size={12} className="text-paper-500" />
              <span>
                {webhook.lastDeliveredAt
                  ? new Date(webhook.lastDeliveredAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* Subscribed Events */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-paper-500">
            <span>Subscribed Events ({webhook.events?.length || 0})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {webhook.events?.map((evt) => {
              const meta = EVENT_LABELS[evt] || {
                label: evt,
                color: 'bg-ink-800 text-paper-300 border-ink-600',
              };
              return (
                <span
                  key={evt}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] ${meta.color}`}
                >
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebhookCard;
