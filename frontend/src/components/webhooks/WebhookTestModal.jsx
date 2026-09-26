import { useState } from 'react';
import { Send, CheckCircle2, XCircle, Clock, Copy, Check, RotateCw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { webhookService } from '../../services';
import { headersToText } from './webhookFormat';

/**
 * Sends one signed sample event (any catalog type) and shows the exact
 * exchange. Test pings are attempted once, never retried, and don't count
 * toward the endpoint's health.
 */
const WebhookTestModal = ({ open, onClose, webhook, catalog, onTestComplete }) => {
  const [selectedEvent, setSelectedEvent] = useState('endpoint.test');
  const [isRunning, setIsRunning] = useState(false);
  const [delivery, setDelivery] = useState(null);
  const [requestError, setRequestError] = useState(null);
  const [activeTab, setActiveTab] = useState('request');
  const [copiedSection, setCopiedSection] = useState(null);

  const handleRunTest = async () => {
    if (!webhook) return;
    setIsRunning(true);
    setDelivery(null);
    setRequestError(null);
    try {
      const res = await webhookService.test(webhook._id, selectedEvent);
      setDelivery(res.delivery);
      const status = res.delivery?.lastResponseStatus;
      if (res.delivery?.status === 'succeeded') toast.success(`Ping delivered (HTTP ${status})`);
      else toast.error(`Ping failed${status ? ` (HTTP ${status})` : ''}`);
      onTestComplete?.();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to send test ping';
      setRequestError(message);
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  };

  const copy = (text, section) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedSection(null), 2000);
  };

  if (!webhook) return null;

  const attempt = delivery?.attempts?.at(-1);
  const isSuccess = delivery?.status === 'succeeded';
  const payloadText = delivery?.payload ? JSON.stringify(delivery.payload, null, 2) : '';
  const tabs = [
    { id: 'request', label: 'Request Sent' },
    { id: 'response', label: 'Response Received' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Test Webhook Endpoint" maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div className="rounded-lg border border-ink-700 bg-ink-950 p-3">
          <div className="flex items-center justify-between text-xs text-paper-400 mb-1">
            <span className="font-medium">Target Endpoint</span>
            <span className="font-mono text-paper-500">POST</span>
          </div>
          <div className="font-mono text-xs text-paper-100 truncate">{webhook.url}</div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <label className="field-label" htmlFor="test-event-select">
              Event to simulate
            </label>
            <select
              id="test-event-select"
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="input text-xs"
              disabled={isRunning}
            >
              {catalog.map((evt) => (
                <option key={evt.type} value={evt.type}>
                  {evt.type}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-paper-500">
              {catalog.find((e) => e.type === selectedEvent)?.description}
            </p>
          </div>
          <button type="button" onClick={handleRunTest} disabled={isRunning} className="btn btn-primary h-[42px] whitespace-nowrap">
            {isRunning ? <RotateCw size={15} className="animate-spin" /> : <Send size={15} />}
            <span>{isRunning ? 'Sending…' : 'Send Test Ping'}</span>
          </button>
        </div>

        {requestError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{requestError}</span>
          </div>
        )}

        {delivery && attempt && (
          <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-700 pb-3">
              <div className="flex items-center gap-2">
                {isSuccess ? <CheckCircle2 size={18} className="text-accent-400" /> : <XCircle size={18} className="text-rose-400" />}
                <span className="font-semibold text-sm text-paper-100">
                  {attempt.responseStatus ? `HTTP ${attempt.responseStatus}` : 'No response'}
                </span>
                <span
                  className={`badge text-[11px] border ${
                    isSuccess ? 'bg-accent-400/10 text-accent-400 border-accent-400/25' : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                  }`}
                >
                  {isSuccess ? 'Delivered' : 'Failed'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-paper-400">
                <Clock size={13} />
                <span>{attempt.latencyMs}ms</span>
              </div>
            </div>

            {attempt.error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{attempt.error}</span>
              </div>
            )}

            <div className="flex border-b border-ink-700" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                    activeTab === tab.id ? 'border-accent-400 text-accent-400' : 'border-transparent text-paper-400 hover:text-paper-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'request' ? (
              <div className="space-y-3">
                <Section title="REQUEST HEADERS" text={headersToText(attempt.requestHeaders)} id="req_headers" copied={copiedSection} onCopy={copy} />
                <Section title="REQUEST BODY" text={payloadText} id="req_body" copied={copiedSection} onCopy={copy} tall />
              </div>
            ) : (
              <div className="space-y-3">
                <Section title="RESPONSE HEADERS" text={headersToText(attempt.responseHeaders)} id="res_headers" copied={copiedSection} onCopy={copy} />
                <Section title="RESPONSE BODY (first 2 KB)" text={attempt.responseBody || '(empty)'} id="res_body" copied={copiedSection} onCopy={copy} tall />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

function Section({ title, text, id, copied, onCopy, tall = false }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-medium text-paper-400 mb-1">
        <span>{title}</span>
        <button type="button" onClick={() => onCopy(text, id)} className="inline-flex items-center gap-1 hover:text-accent-400 text-paper-500">
          {copied === id ? <Check size={11} className="text-accent-400" /> : <Copy size={11} />}
          <span>Copy</span>
        </button>
      </div>
      <pre className={`${tall ? 'max-h-48' : 'max-h-28'} overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] text-paper-200`}>
        {text}
      </pre>
    </div>
  );
}

export default WebhookTestModal;
