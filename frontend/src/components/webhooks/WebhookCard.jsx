import { useState } from 'react';
import { Activity, Send, Clock, Key, Trash2, Edit3, Copy, Check, Power, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  eventMeta,
  endpointHealth,
  TONE_CLASSES,
  deliveryStatusMeta,
  formatDateTime,
} from './webhookFormat';

function rateClass(rate) {
  if (rate >= 95) return 'bg-accent-400';
  if (rate >= 80) return 'bg-amber-400';
  return 'bg-rose-400';
}

const WebhookCard = ({ webhook, onTest, onViewLogs, onEdit, onDelete, onRotateSecret, onToggleActive }) => {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    toast.success('Endpoint URL copied');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const health = endpointHealth(webhook);
  const tone = TONE_CLASSES[health.tone];
  const stats = webhook.deliveryStats || {};
  const settled = (stats.succeeded || 0) + (stats.failed || 0);
  const recent = stats.recentDeliveries || [];

  return (
    <div className="panel relative overflow-hidden transition-all duration-200 hover:border-ink-500/70">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${tone.strip}`} />

      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`}>
                {health.tone === 'ok' && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-60" />
                )}
              </span>
              <span className="font-semibold text-paper-100 truncate text-base">
                {webhook.description || 'Webhook Endpoint'}
              </span>
              <span className={`badge text-[11px] font-medium border ${tone.badge}`}>{health.label}</span>
              {webhook.hasPendingSecretRotation && (
                <span
                  className="badge text-[11px] font-medium border bg-sky-500/10 text-sky-400 border-sky-500/20"
                  title={`Both secrets sign deliveries until ${formatDateTime(webhook.previousSecretExpiresAt)}`}
                >
                  <KeyRound size={11} /> Rotation in progress
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onTest(webhook)}
              className="btn btn-secondary btn-sm text-paper-200 hover:text-accent-400 hover:border-accent-400/40"
              title="Send a signed sample event"
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
              title={webhook.isActive ? 'Pause endpoint (queued deliveries are cancelled)' : 'Resume endpoint'}
              aria-label={webhook.isActive ? 'Pause webhook' : 'Resume webhook'}
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

        <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950/80 px-3 py-2 font-mono text-xs text-paper-200">
          <span className="shrink-0 text-paper-500 select-none">POST</span>
          <span className="truncate flex-1 text-paper-100">{webhook.url}</span>
          <button
            type="button"
            onClick={() => copyToClipboard(webhook.url)}
            className="shrink-0 rounded p-1 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
            title="Copy endpoint URL"
          >
            {copiedUrl ? <Check size={13} className="text-accent-400" /> : <Copy size={13} />}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-ink-700/60 bg-ink-950/40 p-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">24h Success</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-paper-100">
                {stats.successRate === null || stats.successRate === undefined ? 'No sends' : `${stats.successRate}%`}
              </span>
              {settled > 0 && (
                <span className="text-[11px] text-paper-400">
                  ({stats.succeeded}/{settled})
                </span>
              )}
            </div>
            {settled > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
                <div className={`h-full ${rateClass(stats.successRate)}`} style={{ width: `${stats.successRate}%` }} />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">In Queue</span>
            <span className={`font-mono text-sm font-semibold ${stats.pending ? 'text-amber-400' : 'text-paper-100'}`}>
              {stats.pending || 0}
            </span>
            <span className="text-[11px] text-paper-500">
              avg {stats.avgLatencyMs === null || stats.avgLatencyMs === undefined ? '—' : `${stats.avgLatencyMs}ms`}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">Recent</span>
            <div className="flex items-center gap-1.5 pt-1">
              {recent.length === 0 ? (
                <span className="text-xs text-paper-500">No deliveries yet</span>
              ) : (
                recent.map((d) => (
                  <div
                    key={d._id}
                    className={`h-2.5 w-2.5 rounded-full ring-1 ring-inset ${deliveryStatusMeta(d.status).dot}`}
                    title={`${d.eventType} · ${deliveryStatusMeta(d.status).label}${d.responseStatus ? ` · HTTP ${d.responseStatus}` : ''}`}
                  />
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-paper-500">Last Success</span>
            <div className="flex items-center gap-1 text-xs text-paper-300">
              <Clock size={12} className="text-paper-500" />
              <span>{formatDateTime(webhook.lastSuccessAt)}</span>
            </div>
            {webhook.failingSince && (
              <span className="text-[11px] text-rose-300">Failing since {formatDateTime(webhook.failingSince)}</span>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
            Subscribed Events ({webhook.events?.length || 0})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {webhook.events?.map((evt) => {
              const meta = eventMeta(evt);
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
