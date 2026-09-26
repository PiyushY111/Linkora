/**
 * Display helpers shared by the webhook page and its components. Event
 * names and descriptions come from the API's catalog (GET /webhooks/events);
 * this file only adds colour and short labels.
 */

const NEUTRAL = 'bg-ink-800 text-paper-300 border-ink-600';

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

export function eventMeta(type) {
  return EVENT_LABELS[type] || { label: type, color: NEUTRAL };
}

export const DELIVERY_STATUS = {
  succeeded: { label: 'Delivered', text: 'text-accent-400', dot: 'bg-accent-400 ring-accent-400/40' },
  failed: { label: 'Failed', text: 'text-rose-400', dot: 'bg-rose-500 ring-rose-500/40' },
  pending: { label: 'Retrying', text: 'text-amber-400', dot: 'bg-amber-400 ring-amber-400/40' },
  in_flight: { label: 'Sending', text: 'text-sky-400', dot: 'bg-sky-400 ring-sky-400/40' },
  cancelled: { label: 'Cancelled', text: 'text-paper-400', dot: 'bg-paper-500 ring-paper-500/40' },
};

export function deliveryStatusMeta(status) {
  return DELIVERY_STATUS[status] || { label: status, text: 'text-paper-400', dot: 'bg-paper-500 ring-paper-500/40' };
}

/** A queued first attempt is "Queued", not "Retrying". */
export function deliveryStatusLabel(delivery) {
  if (delivery.status === 'pending' && !delivery.attemptCount) return 'Queued';
  return deliveryStatusMeta(delivery.status).label;
}

const DISABLED_REASON_LABEL = {
  manual: 'Paused',
  failing: 'Disabled: failing for 72h',
  gone: 'Disabled: endpoint returned 410 Gone',
};

/**
 * One summary of an endpoint's state for badges and the status strip.
 * @returns {{ label: string, tone: 'ok' | 'warn' | 'bad' | 'off' }}
 */
export function endpointHealth(webhook) {
  if (!webhook.isActive) {
    return { label: DISABLED_REASON_LABEL[webhook.disabledReason] || 'Paused', tone: webhook.disabledReason === 'manual' ? 'off' : 'bad' };
  }
  const circuit = webhook.circuit || {};
  if (circuit.state === 'open') return { label: `Circuit open until ${formatTime(circuit.openUntil)}`, tone: 'bad' };
  if (circuit.state === 'half_open') return { label: 'Probing recovery', tone: 'warn' };
  if (circuit.consecutiveFailures > 0) return { label: `Degraded (${circuit.consecutiveFailures} failing in a row)`, tone: 'warn' };
  return { label: 'Operational', tone: 'ok' };
}

export const TONE_CLASSES = {
  ok: { strip: 'bg-accent-400', dot: 'bg-accent-400', badge: 'bg-accent-400/10 text-accent-400 border-accent-400/25' },
  warn: { strip: 'bg-amber-400', dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  bad: { strip: 'bg-rose-500', dot: 'bg-rose-500', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/25' },
  off: { strip: 'bg-ink-600', dot: 'bg-paper-500', badge: 'bg-ink-800 text-paper-400 border-ink-600' },
};

export function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value, { seconds = false } = {}) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds && { second: '2-digit' }),
  });
}

export function headersToText(headers) {
  const entries = Object.entries(headers || {});
  return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join('\n') : 'None recorded';
}
