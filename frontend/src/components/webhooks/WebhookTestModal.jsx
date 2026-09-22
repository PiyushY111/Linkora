import { useState } from 'react';
import {
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Code2,
  Copy,
  Check,
  RotateCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { webhookService } from '../../services';

const TEST_EVENTS = [
  { value: 'endpoint.test', label: 'endpoint.test (Verification Ping)' },
  { value: 'link.clicked', label: 'link.clicked (Click Stream Event)' },
  { value: 'link.created', label: 'link.created (Link Lifecycle Created)' },
  { value: 'link.updated', label: 'link.updated (Link Lifecycle Updated)' },
  { value: 'link.deleted', label: 'link.deleted (Link Lifecycle Deleted)' },
  { value: 'link.limit_reached', label: 'link.limit_reached (Capacity Limit Exceeded)' },
  { value: 'link.expired', label: 'link.expired (Lifecycle Expired)' },
  { value: 'security.abuse_flagged', label: 'security.abuse_flagged (Threat Flagged)' },
];

const WebhookTestModal = ({ open, onClose, webhook, onTestComplete }) => {
  const [selectedEvent, setSelectedEvent] = useState('endpoint.test');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('request');
  const [copiedSection, setCopiedSection] = useState(null);

  const handleRunTest = async () => {
    if (!webhook) return;
    setIsRunning(true);
    setResult(null);

    try {
      const res = await webhookService.test(webhook._id, selectedEvent);
      setResult(res.result);
      if (res.result?.delivery?.status === 'success') {
        toast.success(`Ping succeeded with HTTP ${res.result.delivery.responseStatus}`);
      } else {
        toast.error(`Ping failed: HTTP ${res.result?.delivery?.responseStatus || 'Error'}`);
      }
      if (onTestComplete) {
        onTestComplete();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dispatch test ping');
      setResult({
        delivery: {
          status: 'failed',
          responseStatus: null,
          latencyMs: 0,
          error: err.response?.data?.message || err.message,
        },
      });
    } finally {
      setIsRunning(false);
    }
  };

  const copyCode = (text, section) => {
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    setCopiedSection(section);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedSection(null), 2000);
  };

  if (!webhook) return null;

  const delivery = result?.delivery;
  const isSuccess = delivery?.status === 'success';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test Webhook Endpoint"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Endpoint target info */}
        <div className="rounded-lg border border-ink-700 bg-ink-950 p-3">
          <div className="flex items-center justify-between text-xs text-paper-400 mb-1">
            <span className="font-medium">Target Endpoint</span>
            <span className="font-mono text-paper-500">Method: POST</span>
          </div>
          <div className="font-mono text-xs text-paper-100 truncate">
            {webhook.url}
          </div>
        </div>

        {/* Event selector & Send Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1">
            <label className="field-label" htmlFor="test-event-select">
              Event to Simulate
            </label>
            <select
              id="test-event-select"
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="input text-xs"
              disabled={isRunning}
            >
              {TEST_EVENTS.map((evt) => (
                <option key={evt.value} value={evt.value}>
                  {evt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={handleRunTest}
              disabled={isRunning}
              className="btn btn-primary h-[42px] whitespace-nowrap"
            >
              {isRunning ? (
                <>
                  <RotateCw size={15} className="animate-spin" />
                  <span>Dispatching…</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>Send Test Ping</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Execution Results Inspector */}
        {result && (
          <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-4">
            {/* Status & Latency Ribbon */}
            <div className="flex items-center justify-between border-b border-ink-700 pb-3">
              <div className="flex items-center gap-2">
                {isSuccess ? (
                  <CheckCircle2 size={18} className="text-accent-400" />
                ) : (
                  <XCircle size={18} className="text-rose-400" />
                )}
                <span className="font-semibold text-sm text-paper-100">
                  {delivery.responseStatus
                    ? `HTTP ${delivery.responseStatus}`
                    : 'Delivery Failed'}
                </span>
                <span
                  className={`badge text-[11px] ${
                    isSuccess
                      ? 'bg-accent-400/10 text-accent-400 border border-accent-400/25'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/25'
                  }`}
                >
                  {isSuccess ? 'Success (2xx)' : 'Failed'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs text-paper-400">
                <Clock size={13} />
                <span>{delivery.latencyMs}ms</span>
              </div>
            </div>

            {/* Failure Alert Banner */}
            {delivery.error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Error Dispatching:</span>{' '}
                  {delivery.error}
                </div>
              </div>
            )}

            {/* Inspector Tabs */}
            <div className="flex border-b border-ink-700">
              <button
                type="button"
                onClick={() => setActiveTab('request')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === 'request'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-400 hover:text-paper-200'
                }`}
              >
                Request Sent
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('response')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === 'response'
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-400 hover:text-paper-200'
                }`}
              >
                Response Received
              </button>
            </div>

            {/* Tab: Request Sent */}
            {activeTab === 'request' && (
              <div className="space-y-3">
                {/* Headers */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-paper-400 mb-1">
                    <span>REQUEST HEADERS</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyCode(delivery.requestHeaders, 'req_headers')
                      }
                      className="inline-flex items-center gap-1 hover:text-accent-400 text-paper-500"
                    >
                      {copiedSection === 'req_headers' ? (
                        <Check size={11} className="text-accent-400" />
                      ) : (
                        <Copy size={11} />
                      )}
                      <span>Copy Headers</span>
                    </button>
                  </div>
                  <pre className="max-h-28 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] text-paper-300">
                    {delivery.requestHeaders
                      ? Object.entries(delivery.requestHeaders)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join('\n')
                      : 'No headers recorded'}
                  </pre>
                </div>

                {/* Payload */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-paper-400 mb-1">
                    <span>REQUEST BODY (JSON)</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyCode(delivery.requestPayload, 'req_payload')
                      }
                      className="inline-flex items-center gap-1 hover:text-accent-400 text-paper-500"
                    >
                      {copiedSection === 'req_payload' ? (
                        <Check size={11} className="text-accent-400" />
                      ) : (
                        <Copy size={11} />
                      )}
                      <span>Copy JSON</span>
                    </button>
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] text-paper-200 selection:bg-accent-400 selection:text-ink-950">
                    {JSON.stringify(delivery.requestPayload, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Tab: Response Received */}
            {activeTab === 'response' && (
              <div className="space-y-3">
                {/* Headers */}
                {delivery.responseHeaders && (
                  <div>
                    <div className="text-[11px] font-medium text-paper-400 mb-1">
                      RESPONSE HEADERS
                    </div>
                    <pre className="max-h-24 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] text-paper-300">
                      {Object.entries(delivery.responseHeaders)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\n')}
                    </pre>
                  </div>
                )}

                {/* Body */}
                <div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-paper-400 mb-1">
                    <span>RESPONSE BODY</span>
                    {delivery.responseBody && (
                      <button
                        type="button"
                        onClick={() =>
                          copyCode(delivery.responseBody, 'res_body')
                        }
                        className="inline-flex items-center gap-1 hover:text-accent-400 text-paper-500"
                      >
                        {copiedSection === 'res_body' ? (
                          <Check size={11} className="text-accent-400" />
                        ) : (
                          <Copy size={11} />
                        )}
                        <span>Copy Body</span>
                      </button>
                    )}
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] text-paper-200">
                    {delivery.responseBody || '(No response body returned)'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default WebhookTestModal;
