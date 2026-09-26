import { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Webhook as WebhookIcon, Plus, CheckCircle2, AlertTriangle, RotateCw, Copy, Check, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import WebhookCard from '../components/webhooks/WebhookCard';
import WebhookTestModal from '../components/webhooks/WebhookTestModal';
import WebhookDeliveryDrawer from '../components/webhooks/WebhookDeliveryDrawer';
import WebhookVerificationGuideModal from '../components/webhooks/WebhookVerificationGuideModal';
import WebhookEventPicker from '../components/webhooks/WebhookEventPicker';
import WebhookRotateSecretModal from '../components/webhooks/WebhookRotateSecretModal';
import { endpointHealth, formatDateTime } from '../components/webhooks/webhookFormat';
import { useConfirm } from '../context/ConfirmContext';
import { webhookService } from '../services';
import { getApiOrigin } from '../services/api';

const DEFAULT_EVENTS = ['link.clicked', 'link.created', 'link.limit_reached'];
const EMPTY_FORM = { url: '', description: '', events: DEFAULT_EVENTS };

// The backend's echo receiver exists only outside production.
const ECHO_URL = import.meta.env.DEV ? `${getApiOrigin() || window.location.origin}/api/webhooks/debug/echo` : null;

function WebhookForm({ form, setForm, catalog, onSubmit, submitLabel, busyLabel, isBusy, onCancel, autoFocus }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="webhook-url">
          Endpoint URL
        </label>
        <input
          id="webhook-url"
          type="url"
          className="input-mono text-xs"
          placeholder="https://api.yourdomain.com/webhooks/linkora"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          required
          autoFocus={autoFocus}
        />
        <p className="mt-1 text-[11px] text-paper-500">
          HTTPS in production. Private, loopback and cloud-metadata addresses are refused, and DNS is re-checked before every
          delivery.
        </p>
        {ECHO_URL && (
          <button
            type="button"
            onClick={() => setForm({ ...form, url: ECHO_URL, description: form.description || 'Local echo receiver' })}
            className="mt-2 text-[11px] text-accent-400 hover:underline font-mono bg-accent-400/10 px-2 py-0.5 rounded border border-accent-400/20"
          >
            Use the local echo endpoint
          </button>
        )}
      </div>

      <div>
        <label className="field-label" htmlFor="webhook-desc">
          Name (optional)
        </label>
        <input
          id="webhook-desc"
          type="text"
          maxLength={200}
          className="input text-xs"
          placeholder="e.g. Analytics ingestion, Zapier"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>

      <WebhookEventPicker catalog={catalog} selected={form.events} onChange={(events) => setForm({ ...form, events })} />

      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary flex-1" disabled={isBusy}>
          {isBusy ? (
            <>
              <RotateCw size={14} className="animate-spin" />
              <span>{busyLabel}</span>
            </>
          ) : (
            submitLabel
          )}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SummaryTile({ label, children }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-100">{children}</div>
    </div>
  );
}

const Webhooks = () => {
  const confirm = useConfirm();
  const [webhooks, setWebhooks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);

  const [editWebhook, setEditWebhook] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [secretReveal, setSecretReveal] = useState(null); // { secret, title, subtitle }
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [rotateTarget, setRotateTarget] = useState(null);
  const [testModalWebhook, setTestModalWebhook] = useState(null);
  const [drawerWebhook, setDrawerWebhook] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await webhookService.list();
      setWebhooks(data.webhooks || []);
    } catch (error) {
      // Webhooks are admin-only per workspace; surface the role message.
      toast.error(error.response?.data?.message || 'Failed to load webhooks');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
    webhookService
      .eventCatalog()
      .then((data) => setCatalog(data.events || []))
      .catch(() => toast.error('Failed to load the event catalog'));
  }, [fetchWebhooks]);

  const stats = useMemo(() => {
    const totals = webhooks.reduce(
      (acc, w) => {
        const s = w.deliveryStats || {};
        const tone = endpointHealth(w).tone;
        return {
          succeeded: acc.succeeded + (s.succeeded || 0),
          settled: acc.settled + (s.succeeded || 0) + (s.failed || 0),
          pending: acc.pending + (s.pending || 0),
          active: acc.active + (w.isActive ? 1 : 0),
          attention: acc.attention + (tone === 'warn' || tone === 'bad' ? 1 : 0),
        };
      },
      { succeeded: 0, settled: 0, pending: 0, active: 0, attention: 0 }
    );
    return { ...totals, successRate: totals.settled > 0 ? Math.round((totals.succeeded / totals.settled) * 100) : null };
  }, [webhooks]);

  const replaceWebhook = (updated) => setWebhooks((prev) => prev.map((w) => (w._id === updated._id ? { ...w, ...updated } : w)));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (createForm.events.length === 0) {
      toast.error('Select at least one event');
      return;
    }
    setIsCreating(true);
    try {
      const data = await webhookService.create(createForm);
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      setSecretReveal({
        secret: data.secret,
        title: 'Webhook endpoint created',
        subtitle: 'Save this signing secret now; it is never shown again. Use it to verify the Linkora-Signature header.',
      });
      toast.success('Webhook created');
      fetchWebhooks();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create webhook');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (editWebhook.events.length === 0) {
      toast.error('Select at least one event');
      return;
    }
    setIsUpdating(true);
    try {
      const { webhook } = await webhookService.update(editWebhook._id, {
        url: editWebhook.url,
        description: editWebhook.description,
        events: editWebhook.events,
      });
      replaceWebhook(webhook);
      setEditWebhook(null);
      toast.success('Webhook updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update webhook');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleActive = async (webhook) => {
    const resuming = !webhook.isActive;
    if (!resuming) {
      const confirmed = await confirm({
        title: 'Pause webhook',
        message: 'While paused, no events are queued for this endpoint and any deliveries still waiting are cancelled. You can replay them after resuming.',
        confirmText: 'Pause',
        cancelText: 'Cancel',
        variant: 'warning',
        detail: webhook.url,
      });
      if (!confirmed) return;
    }
    try {
      const { webhook: updated } = await webhookService.update(webhook._id, { isActive: resuming });
      replaceWebhook(updated);
      toast.success(resuming ? 'Webhook resumed' : 'Webhook paused');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change webhook status');
    }
  };

  const handleRotateSecret = async (gracePeriodHours) => {
    try {
      const res = await webhookService.rotateSecret(rotateTarget._id, gracePeriodHours);
      setRotateTarget(null);
      setSecretReveal({
        secret: res.secret,
        title: 'Signing secret rotated',
        subtitle: res.previousSecretExpiresAt
          ? `Deliveries are signed with both secrets until ${formatDateTime(res.previousSecretExpiresAt)}. Deploy this new secret before then.`
          : 'The previous secret no longer verifies. Deploy this new secret now.',
      });
      toast.success('Signing secret rotated');
      fetchWebhooks();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to rotate secret');
    }
  };

  const handleDelete = async (id) => {
    const target = webhooks.find((w) => w._id === id);
    const confirmed = await confirm({
      title: 'Delete webhook',
      message: 'This removes the endpoint, cancels anything queued for it, and deletes its delivery history.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
      detail: target?.url,
    });
    if (!confirmed) return;
    try {
      await webhookService.remove(id);
      setWebhooks((prev) => prev.filter((w) => w._id !== id));
      toast.success('Webhook deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete webhook');
    }
  };

  const copySecret = (secret) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    toast.success('Secret copied to clipboard');
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const rateTone = stats.successRate === null ? 'text-paper-300' : stats.successRate >= 95 ? 'text-accent-400' : stats.successRate >= 80 ? 'text-amber-400' : 'text-rose-400';

  return (
    <>
      <Helmet>
        <title>Webhooks — Linkora</title>
      </Helmet>
      <AppShell>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-paper-100">Webhooks</h1>
              <span className="badge-accent font-mono text-[11px]">HMAC-SHA256</span>
            </div>
            <p className="mt-1 text-sm text-paper-400">
              Signed, at-least-once event delivery with automatic retries, a per-endpoint circuit breaker, and replay.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setShowGuide(true)} className="btn btn-secondary text-xs">
              <BookOpen size={14} />
              <span>Verify Signatures</span>
            </button>
            <button type="button" onClick={() => setShowCreate(true)} className="btn-primary text-xs">
              <Plus size={15} />
              <span>New Webhook</span>
            </button>
          </div>
        </div>

        {webhooks.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Endpoints">
              <span>{webhooks.length}</span>
              <span className="flex items-center gap-1 text-xs text-accent-400">
                <CheckCircle2 size={13} />
                {stats.active} active
              </span>
            </SummaryTile>
            <SummaryTile label="24h Success Rate">
              <span className={rateTone}>{stats.successRate === null ? '—' : `${stats.successRate}%`}</span>
              <span className="text-xs text-paper-500">({stats.settled} settled)</span>
            </SummaryTile>
            <SummaryTile label="Queued / Retrying">
              <span className={stats.pending > 0 ? 'text-amber-400' : 'text-paper-100'}>{stats.pending}</span>
            </SummaryTile>
            <SummaryTile label="Need Attention">
              <span className={stats.attention > 0 ? 'text-rose-400' : 'text-paper-100'}>{stats.attention}</span>
            </SummaryTile>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : webhooks.length > 0 ? (
          <div className="space-y-4">
            {webhooks.map((hook) => (
              <WebhookCard
                key={hook._id}
                webhook={hook}
                onTest={setTestModalWebhook}
                onViewLogs={setDrawerWebhook}
                onEdit={(w) => setEditWebhook({ _id: w._id, url: w.url, description: w.description || '', events: [...w.events] })}
                onRotateSecret={setRotateTarget}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={WebhookIcon}
            title="No webhooks configured"
            description="Add an endpoint to receive signed HTTPS POSTs for clicks, link lifecycle changes and abuse alerts."
            action={
              <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
                <Plus size={16} /> New Webhook
              </button>
            }
          />
        )}
      </AppShell>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Webhook Endpoint" maxWidth="max-w-xl">
        <WebhookForm
          form={createForm}
          setForm={setCreateForm}
          catalog={catalog}
          onSubmit={handleCreate}
          submitLabel="Create Webhook"
          busyLabel="Creating…"
          isBusy={isCreating}
          onCancel={() => setShowCreate(false)}
          autoFocus
        />
      </Modal>

      {editWebhook && (
        <Modal open onClose={() => setEditWebhook(null)} title="Edit Webhook Endpoint" maxWidth="max-w-xl">
          <WebhookForm
            form={editWebhook}
            setForm={setEditWebhook}
            catalog={catalog}
            onSubmit={handleUpdate}
            submitLabel="Save Changes"
            busyLabel="Saving…"
            isBusy={isUpdating}
            onCancel={() => setEditWebhook(null)}
          />
        </Modal>
      )}

      {secretReveal && (
        <Modal open onClose={() => setSecretReveal(null)} title={secretReveal.title} maxWidth="max-w-md">
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{secretReveal.subtitle}</span>
            </div>
            <div>
              <span className="field-label">Signing Secret</span>
              <div className="relative flex items-center rounded-lg border border-ink-600 bg-ink-950 p-3">
                <span className="font-mono text-xs text-accent-400 break-all select-all pr-8">{secretReveal.secret}</span>
                <button
                  type="button"
                  onClick={() => copySecret(secretReveal.secret)}
                  className="absolute right-2.5 rounded p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                  title="Copy secret"
                  aria-label="Copy secret"
                >
                  {copiedSecret ? <Check size={14} className="text-accent-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <button type="button" className="btn-primary w-full" onClick={() => setSecretReveal(null)}>
              I have saved this secret
            </button>
          </div>
        </Modal>
      )}

      {rotateTarget && (
        <WebhookRotateSecretModal webhook={rotateTarget} onClose={() => setRotateTarget(null)} onConfirm={handleRotateSecret} />
      )}

      {testModalWebhook && (
        <WebhookTestModal
          open
          onClose={() => setTestModalWebhook(null)}
          webhook={testModalWebhook}
          catalog={catalog}
          onTestComplete={fetchWebhooks}
        />
      )}

      {drawerWebhook && (
        <WebhookDeliveryDrawer open onClose={() => setDrawerWebhook(null)} webhook={drawerWebhook} onChanged={fetchWebhooks} />
      )}

      <WebhookVerificationGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
    </>
  );
};

export default Webhooks;
