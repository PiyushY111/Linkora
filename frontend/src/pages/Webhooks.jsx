import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Webhook as WebhookIcon, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { webhookService } from '../services';

const EVENT_OPTIONS = [
  { value: 'click', label: 'Click' },
  { value: 'link.expired', label: 'Link expired' },
  { value: 'abuse.flagged', label: 'Abuse flagged' },
];

const Webhooks = () => {
  const [webhooks, setWebhooks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [lastSecret, setLastSecret] = useState(null);
  const [formData, setFormData] = useState({ url: '', events: [] });

  const fetchWebhooks = async () => {
    setIsLoading(true);
    try {
      const data = await webhookService.list();
      setWebhooks(data.webhooks);
    } catch {
      toast.error('Failed to load webhooks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const toggleEvent = (value) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(value) ? prev.events.filter((e) => e !== value) : [...prev.events, value],
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (formData.events.length === 0) {
      toast.error('Select at least one event');
      return;
    }
    setIsCreating(true);
    try {
      const data = await webhookService.create(formData.url, formData.events);
      setLastSecret(data.webhook.secret);
      setFormData({ url: '', events: [] });
      toast.success('Webhook created');
      fetchWebhooks();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create webhook');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this webhook subscription?')) return;
    try {
      await webhookService.remove(id);
      setWebhooks((prev) => prev.filter((w) => w._id !== id));
      toast.success('Webhook deleted');
    } catch {
      toast.error('Failed to delete webhook');
    }
  };

  return (
    <>
      <Helmet>
        <title>Webhooks — Linkly</title>
      </Helmet>
      <AppShell>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-paper-100">Webhooks</h1>
            <p className="mt-1 text-sm text-paper-500">
              HMAC-signed delivery with retry and a dead-letter queue for failed sends.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLastSecret(null);
              setShowCreate(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> New webhook
          </button>
        </div>

        {isLoading ? (
          <Skeleton className="h-32" />
        ) : webhooks.length > 0 ? (
          <div className="space-y-3">
            {webhooks.map((hook) => (
              <div key={hook._id} className="panel flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-paper-100">{hook.url}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {hook.events.map((evt) => (
                      <span key={evt} className="badge-neutral">{evt}</span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(hook._id)}
                  className="ml-3 shrink-0 rounded-lg p-2 text-paper-500 hover:bg-danger/10 hover:text-danger"
                  aria-label="Delete webhook"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={WebhookIcon}
            title="No webhooks configured"
            description="Subscribe an endpoint to click, expiration, or abuse events."
            action={
              <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
                <Plus size={16} /> New webhook
              </button>
            }
          />
        )}
      </AppShell>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New webhook">
        {lastSecret ? (
          <div className="space-y-4">
            <p className="text-sm text-paper-300">
              Save this signing secret now — it won&apos;t be shown again. Verify the{' '}
              <code className="font-mono text-xs text-paper-100">X-Linkly-Signature</code> header with it.
            </p>
            <div className="break-all rounded-lg border border-ink-600 bg-ink-950 px-3 py-2.5 font-mono text-sm text-accent-400">
              {lastSecret}
            </div>
            <button type="button" className="btn-primary w-full" onClick={() => setShowCreate(false)}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="url">Endpoint URL</label>
              <input
                id="url"
                type="url"
                className="input"
                placeholder="https://your-app.com/webhooks/linkly"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div>
              <span className="field-label">Events</span>
              <div className="space-y-2">
                {EVENT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2.5 text-sm text-paper-200"
                  >
                    <input
                      type="checkbox"
                      checked={formData.events.includes(opt.value)}
                      onChange={() => toggleEvent(opt.value)}
                      className="h-4 w-4 accent-accent-400"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" className="btn-primary flex-1" disabled={isCreating}>
                {isCreating ? 'Creating…' : 'Create webhook'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
};

export default Webhooks;
