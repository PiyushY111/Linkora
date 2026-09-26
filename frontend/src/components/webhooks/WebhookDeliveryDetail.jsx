import { useState } from 'react';
import { AlertCircle, Check, Copy, RotateCw, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTime, headersToText } from './webhookFormat';

const OUTCOME_STYLE = {
  success: { label: 'Delivered', className: 'text-accent-400 border-accent-400/30 bg-accent-400/10' },
  retryable: { label: 'Will retry', className: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  fatal: { label: 'Not retried', className: 'text-rose-400 border-rose-500/30 bg-rose-500/10' },
};

function CopyBlock({ label, value, id, copiedId, onCopy, maxHeight = 'max-h-36' }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-medium text-paper-400 mb-1">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => onCopy(value, id)}
          className="inline-flex items-center gap-1 hover:text-accent-400 text-paper-500 text-[11px]"
        >
          {copiedId === id ? <Check size={11} className="text-accent-400" /> : <Copy size={11} />}
          <span>Copy</span>
        </button>
      </div>
      <pre className={`${maxHeight} overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[11px] text-paper-200`}>
        {value}
      </pre>
    </div>
  );
}

/**
 * The full record of one delivery: why it's in its state, every recorded
 * attempt (newest first, each with its own request/response), and the
 * payload as sent.
 */
const WebhookDeliveryDetail = ({ delivery, onReplay, isReplaying }) => {
  const [copiedId, setCopiedId] = useState(null);
  const [openAttempt, setOpenAttempt] = useState(delivery.attempts?.length ? delivery.attempts.at(-1).n : null);

  const copy = (value, id) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const attempts = [...(delivery.attempts || [])].reverse();
  const payloadText = delivery.payload ? JSON.stringify(delivery.payload, null, 2) : '(event expired)';

  return (
    <div className="border-t border-ink-700 bg-ink-950/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-paper-400 space-x-3">
          <span>
            Event <code className="text-paper-200">{delivery.event}</code>
          </span>
          <span>
            Attempts {delivery.attemptCount}/{delivery.maxAttempts}
          </span>
          {delivery.status === 'pending' && delivery.nextAttemptAt && (
            <span className="text-amber-300">Next attempt {formatDateTime(delivery.nextAttemptAt, { seconds: true })}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onReplay}
          disabled={isReplaying || !delivery.payload}
          className="btn btn-secondary btn-sm text-paper-100 hover:text-accent-400 hover:border-accent-400/40"
          title={delivery.payload ? 'Send this event again now (same event id)' : 'The event has expired'}
        >
          {isReplaying ? <RotateCw size={12} className="animate-spin" /> : <Send size={12} />}
          <span>{isReplaying ? 'Replaying…' : 'Replay now'}</span>
        </button>
      </div>

      {delivery.cancelReason && (
        <div className="flex items-start gap-2 rounded-lg border border-ink-600 bg-ink-900 p-2.5 text-xs text-paper-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>Cancelled: {delivery.cancelReason}</span>
        </div>
      )}

      <div>
        <div className="text-[11px] font-medium text-paper-400 mb-1.5">ATTEMPTS</div>
        {attempts.length === 0 ? (
          <p className="text-xs text-paper-500">Not attempted yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {attempts.map((a) => {
              const style = OUTCOME_STYLE[a.outcome] || OUTCOME_STYLE.fatal;
              const isOpen = openAttempt === a.n;
              return (
                <li key={a.n} className="rounded-lg border border-ink-700 bg-ink-900">
                  <button
                    type="button"
                    onClick={() => setOpenAttempt(isOpen ? null : a.n)}
                    className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs"
                    aria-expanded={isOpen}
                  >
                    <span className="font-mono text-paper-500">#{a.n}</span>
                    <span className={`badge border text-[10px] ${style.className}`}>{style.label}</span>
                    <span className="font-mono text-paper-200">{a.responseStatus ? `HTTP ${a.responseStatus}` : 'No response'}</span>
                    <span className="font-mono text-paper-500">{a.latencyMs}ms</span>
                    {a.error && <span className="truncate max-w-[260px] text-rose-300/80" title={a.error}>{a.error}</span>}
                    <span className="ml-auto text-paper-500">{formatDateTime(a.at, { seconds: true })}</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-ink-700 p-3">
                      <CopyBlock
                        label="REQUEST HEADERS"
                        value={headersToText(a.requestHeaders)}
                        id={`req-${a.n}`}
                        copiedId={copiedId}
                        onCopy={copy}
                        maxHeight="max-h-28"
                      />
                      <CopyBlock
                        label="RESPONSE HEADERS"
                        value={headersToText(a.responseHeaders)}
                        id={`resh-${a.n}`}
                        copiedId={copiedId}
                        onCopy={copy}
                        maxHeight="max-h-24"
                      />
                      <CopyBlock
                        label="RESPONSE BODY (first 2 KB)"
                        value={a.responseBody || '(empty)'}
                        id={`resb-${a.n}`}
                        copiedId={copiedId}
                        onCopy={copy}
                        maxHeight="max-h-28"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <CopyBlock label="PAYLOAD (request body)" value={payloadText} id="payload" copiedId={copiedId} onCopy={copy} maxHeight="max-h-48" />
    </div>
  );
};

export default WebhookDeliveryDetail;
