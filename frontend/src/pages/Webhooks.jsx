import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Webhook as WebhookIcon,
  Plus,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Copy,
  Check,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import WebhookCard from '../components/webhooks/WebhookCard';
import WebhookTestModal from '../components/webhooks/WebhookTestModal';
import WebhookDeliveryDrawer from '../components/webhooks/WebhookDeliveryDrawer';
import WebhookVerificationGuideModal from '../components/webhooks/WebhookVerificationGuideModal';
import { useConfirm } from '../context/ConfirmContext';
import { webhookService } from '../services';

const ALL_EVENTS = [
  {
    value: 'link.clicked',
    label: 'link.clicked',
    description: 'Triggered whenever a link redirect occurs with device/geo data.',
  },
  {
    value: 'link.created',
    label: 'link.created',
    description: 'Triggered when a new short link is provisioned.',
  },
  {
    value: 'link.updated',
    label: 'link.updated',
    description: 'Triggered when link destination, tags, or settings are altered.',
  },
  {
    value: 'link.deleted',
    label: 'link.deleted',
    description: 'Triggered when a link is removed from the system.',
  },
  {
    value: 'link.limit_reached',
    label: 'link.limit_reached',
    description: 'Triggered when link exceeds max clicks or unique visitor cap.',
  },
  {
    value: 'link.expired',
    label: 'link.expired',
    description: 'Triggered when a link passes its expiration date.',
  },
  {
    value: 'security.abuse_flagged',
    label: 'security.abuse_flagged',
    description: 'Triggered when phishing, malware, or spam threat is flagged.',
  },
  {
    value: 'endpoint.test',
    label: 'endpoint.test',
    description: 'Synthetic verification pings sent via test runner.',
  },
];

const Webhooks = () => {
  const confirm = useConfirm();
  const [webhooks, setWebhooks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createData, setCreateData] = useState({
    url: '',
    description: '',
    events: ['link.clicked', 'link.created', 'link.limit_reached'],
  });

  const [editWebhook, setEditWebhook] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [activeSecretModal, setActiveSecretModal] = useState(null); // { secret, title, subtitle }
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [testModalWebhook, setTestModalWebhook] = useState(null);
  const [drawerWebhook, setDrawerWebhook] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  const fetchWebhooks = async () => {
    setIsLoading(true);
    try {
      const data = await webhookService.list();
      setWebhooks(data.webhooks || []);
    } catch (error) {
      // Webhooks are admin-only per workspace; surface the role message.
      toast.error(error.response?.data?.message || 'Failed to load webhooks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = webhooks.length;
    const active = webhooks.filter((w) => w.isActive).length;
    const degraded = webhooks.filter((w) => w.isActive && (w.consecutiveFailures || 0) > 0).length;
    const disabled = total - active;

    let total24hDeliveries = 0;
    let total24hSuccess = 0;

    webhooks.forEach((w) => {
      if (w.health) {
        total24hDeliveries += w.health.totalDeliveries24h || 0;
        total24hSuccess += w.health.successful24h || 0;
      }
    });

    const avgSuccessRate =
      total24hDeliveries > 0
        ? Math.round((total24hSuccess / total24hDeliveries) * 100)
        : 100;

    return {
      total,
      active,
      degraded,
      disabled,
      total24hDeliveries,
      avgSuccessRate,
    };
  }, [webhooks]);

  const toggleEventInCreate = (evt) => {
    setCreateData((prev) => ({
      ...prev,
      events: prev.events.includes(evt)
        ? prev.events.filter((e) => e !== evt)
        : [...prev.events, evt],
    }));
  };

  const toggleAllEventsInCreate = () => {
    if (createData.events.length === ALL_EVENTS.length) {
      setCreateData((prev) => ({ ...prev, events: [] }));
    } else {
      setCreateData((prev) => ({
        ...prev,
        events: ALL_EVENTS.map((e) => e.value),
      }));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (createData.events.length === 0) {
      toast.error('Select at least one event');
      return;
    }

    setIsCreating(true);
    try {
      const data = await webhookService.create({
        url: createData.url,
        description: createData.description,
        events: createData.events,
      });

      setShowCreate(false);
      setCreateData({
        url: '',
        description: '',
        events: ['link.clicked', 'link.created', 'link.limit_reached'],
      });

      setActiveSecretModal({
        secret: data.webhook.secret,
        title: 'Webhook Endpoint Provisioned',
        subtitle:
          'Save this signing secret now — it cannot be viewed again. Verify the Linkora-Signature header on every payload using this secret.',
      });

      toast.success('Webhook created successfully');
      fetchWebhooks();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create webhook');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editWebhook) return;
    if (editWebhook.events.length === 0) {
      toast.error('Select at least one event');
      return;
    }

    setIsUpdating(true);
    try {
      await webhookService.update(editWebhook._id, {
        url: editWebhook.url,
        description: editWebhook.description,
        events: editWebhook.events,
        isActive: editWebhook.isActive,
      });

      setEditWebhook(null);
      toast.success('Webhook updated');
      fetchWebhooks();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update webhook');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleActive = async (webhook) => {
    const nextActive = !webhook.isActive;
    try {
      await webhookService.update(webhook._id, { isActive: nextActive });
      setWebhooks((prev) =>
        prev.map((w) =>
          w._id === webhook._id ? { ...w, isActive: nextActive, disabledAt: null, consecutiveFailures: 0 } : w
        )
      );
      toast.success(nextActive ? 'Webhook enabled' : 'Webhook paused');
    } catch (err) {
      toast.error('Failed to toggle webhook status');
    }
  };

  const handleRotateSecret = async (webhook) => {
    const confirmed = await confirm({
      title: 'Rotate Webhook Signing Secret',
      message:
        'Rotating the signing secret will immediately cause subsequent event deliveries to be signed with the new secret. Your receiving server will need to update its verification logic.',
      confirmText: 'Rotate Secret',
      cancelText: 'Keep Secret',
      variant: 'warning',
      detail: `Endpoint URL: ${webhook.url}`,
    });
    if (!confirmed) return;

    try {
      const res = await webhookService.rotateSecret(webhook._id);
      setActiveSecretModal({
        secret: res.secret,
        title: 'Signing Secret Rotated',
        subtitle:
          'A new secret has been generated. Update your webhook endpoint with this secret immediately to continue verifying signatures.',
      });
      toast.success('Signing secret rotated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to rotate secret');
    }
  };

  const handleDelete = async (id) => {
    const target = webhooks.find((w) => w._id === id);
    const confirmed = await confirm({
      title: 'Delete Webhook Subscription',
      message:
        'Are you sure you want to delete this webhook subscription? All associated delivery history, queued retries, and audit logs will be permanently removed.',
      confirmText: 'Delete Webhook',
      cancelText: 'Cancel',
      variant: 'danger',
      detail: target ? target.url : undefined,
    });
    if (!confirmed) return;

    try {
      await webhookService.remove(id);
      setWebhooks((prev) => prev.filter((w) => w._id !== id));
      toast.success('Webhook and delivery logs deleted');
    } catch {
      toast.error('Failed to delete webhook');
    }
  };

  const copySecretToClipboard = (secret) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    toast.success('Secret copied to clipboard');
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <>
      <Helmet>
        <title>Webhooks — Linkora</title>
      </Helmet>
      <AppShell>
        {/* Page Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-paper-100">
                Webhooks
              </h1>
              <span className="badge-accent font-mono text-[11px]">
                HMAC-SHA256
              </span>
            </div>
            <p className="mt-1 text-sm text-paper-400">
              Enterprise event streaming with replay-proof signatures, exponential backoff retries, and dead-letter queue.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="btn btn-secondary text-xs"
            >
              <BookOpen size={14} />
              <span>Verify Signatures</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-primary text-xs"
            >
              <Plus size={15} />
              <span>New Webhook</span>
            </button>
          </div>
        </div>

        {/* Telemetry Summary Cards */}
        {webhooks.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="panel p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
                Total Endpoints
              </div>
              <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-100">
                {stats.total}
              </div>
            </div>

            <div className="panel p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
                Operational Status
              </div>
              <div className="mt-1 flex items-center gap-2 font-mono text-xl font-bold text-accent-400">
                <CheckCircle2 size={18} />
                <span>{stats.active} Active</span>
              </div>
            </div>

            <div className="panel p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
                24h Success Rate
              </div>
              <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-100">
                <span
                  className={
                    stats.avgSuccessRate >= 95
                      ? 'text-accent-400'
                      : stats.avgSuccessRate >= 80
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }
                >
                  {stats.avgSuccessRate}%
                </span>
                <span className="text-xs text-paper-500">
                  ({stats.total24hDeliveries} sends)
                </span>
              </div>
            </div>

            <div className="panel p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
                Degraded / Paused
              </div>
              <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-300">
                <span className={stats.degraded > 0 ? 'text-amber-400' : 'text-paper-300'}>
                  {stats.degraded} degraded
                </span>
                {stats.disabled > 0 && (
                  <span className="text-xs text-paper-500">
                    / {stats.disabled} paused
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content Section */}
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
                onTest={(w) => setTestModalWebhook(w)}
                onViewLogs={(w) => setDrawerWebhook(w)}
                onEdit={(w) => setEditWebhook({ ...w })}
                onRotateSecret={handleRotateSecret}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={WebhookIcon}
            title="No webhooks configured"
            description="Provision a webhook endpoint to receive realtime HTTPS POST notifications for link clicks, lifecycle updates, and abuse alerts."
            action={
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="btn-primary"
              >
                <Plus size={16} /> New Webhook
              </button>
            }
          />
        )}
      </AppShell>

      {/* 1. Modal: Create Webhook */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Register New Webhook Endpoint"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="create-url">
              Endpoint URL (HTTPS)
            </label>
            <input
              id="create-url"
              type="url"
              className="input-mono text-xs"
              placeholder="https://api.yourdomain.com/v1/webhooks/linkora"
              value={createData.url}
              onChange={(e) =>
                setCreateData({ ...createData, url: e.target.value })
              }
              required
              autoFocus
            />
            <p className="mt-1 text-[11px] text-paper-500">
              Must be an accessible URL. Local addresses and cloud metadata services are blocked for SSRF protection.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-paper-500">Quick fill:</span>
              <button
                type="button"
                onClick={() =>
                  setCreateData({
                    ...createData,
                    url: 'http://127.0.0.1:5001/api/webhooks/debug/echo',
                    description: createData.description || 'Local Built-in Echo Receiver',
                  })
                }
                className="text-accent-400 hover:underline font-mono bg-accent-400/10 px-2 py-0.5 rounded border border-accent-400/20"
              >
                Use Built-in Echo Endpoint
              </button>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="create-desc">
              Description / Friendly Name (Optional)
            </label>
            <input
              id="create-desc"
              type="text"
              className="input text-xs"
              placeholder="e.g. Production Analytics Ingestion, Zapier Pipeline"
              value={createData.description}
              onChange={(e) =>
                setCreateData({ ...createData, description: e.target.value })
              }
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="field-label mb-0">Events to Receive</span>
              <button
                type="button"
                onClick={toggleAllEventsInCreate}
                className="text-[11px] font-medium text-accent-400 hover:underline"
              >
                {createData.events.length === ALL_EVENTS.length
                  ? 'Deselect all'
                  : 'Select all'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {ALL_EVENTS.map((opt) => {
                const checked = createData.events.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                      checked
                        ? 'border-accent-400/40 bg-accent-400/5 text-paper-100'
                        : 'border-ink-700 bg-ink-950 text-paper-400 hover:border-ink-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEventInCreate(opt.value)}
                      className="mt-0.5 h-3.5 w-3.5 accent-accent-400 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs font-semibold text-paper-100">
                        {opt.value}
                      </div>
                      <div className="text-[10px] text-paper-400 leading-tight mt-0.5 line-clamp-2">
                        {opt.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <RotateCw size={14} className="animate-spin" />
                  <span>Provisioning…</span>
                </>
              ) : (
                'Create Webhook'
              )}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Modal: Edit Webhook */}
      {editWebhook && (
        <Modal
          open={Boolean(editWebhook)}
          onClose={() => setEditWebhook(null)}
          title="Edit Webhook Endpoint"
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="edit-url">
                Endpoint URL
              </label>
              <input
                id="edit-url"
                type="url"
                className="input-mono text-xs"
                value={editWebhook.url}
                onChange={(e) =>
                  setEditWebhook({ ...editWebhook, url: e.target.value })
                }
                required
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-paper-500">Quick fill:</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditWebhook({
                      ...editWebhook,
                      url: 'http://127.0.0.1:5001/api/webhooks/debug/echo',
                    })
                  }
                  className="text-accent-400 hover:underline font-mono bg-accent-400/10 px-2 py-0.5 rounded border border-accent-400/20"
                >
                  Use Built-in Echo Endpoint
                </button>
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="edit-desc">
                Description
              </label>
              <input
                id="edit-desc"
                type="text"
                className="input text-xs"
                value={editWebhook.description || ''}
                onChange={(e) =>
                  setEditWebhook({ ...editWebhook, description: e.target.value })
                }
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="field-label mb-0">Events</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {ALL_EVENTS.map((opt) => {
                  const checked = editWebhook.events?.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                        checked
                          ? 'border-accent-400/40 bg-accent-400/5 text-paper-100'
                          : 'border-ink-700 bg-ink-950 text-paper-400 hover:border-ink-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? editWebhook.events.filter((e) => e !== opt.value)
                            : [...editWebhook.events, opt.value];
                          setEditWebhook({ ...editWebhook, events: next });
                        }}
                        className="mt-0.5 h-3.5 w-3.5 accent-accent-400 rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-semibold text-paper-100">
                          {opt.value}
                        </div>
                        <div className="text-[10px] text-paper-400 leading-tight mt-0.5 line-clamp-2">
                          {opt.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="btn-primary flex-1"
                disabled={isUpdating}
              >
                {isUpdating ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditWebhook(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 3. Modal: Secret Reveal (Shown once upon creation or rotation) */}
      {activeSecretModal && (
        <Modal
          open={Boolean(activeSecretModal)}
          onClose={() => setActiveSecretModal(null)}
          title={activeSecretModal.title}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{activeSecretModal.subtitle}</span>
            </div>

            <div>
              <span className="field-label">Signing Secret</span>
              <div className="relative flex items-center rounded-lg border border-ink-600 bg-ink-950 p-3">
                <span className="font-mono text-xs text-accent-400 break-all select-all pr-8">
                  {activeSecretModal.secret}
                </span>
                <button
                  type="button"
                  onClick={() => copySecretToClipboard(activeSecretModal.secret)}
                  className="absolute right-2.5 rounded p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                  title="Copy secret"
                >
                  {copiedSecret ? (
                    <Check size={14} className="text-accent-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => setActiveSecretModal(null)}
              >
                I have saved this secret securely
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 4. Modal: Test Endpoint Runner */}
      {testModalWebhook && (
        <WebhookTestModal
          open={Boolean(testModalWebhook)}
          onClose={() => setTestModalWebhook(null)}
          webhook={testModalWebhook}
          onTestComplete={fetchWebhooks}
        />
      )}

      {/* 5. Drawer: Delivery Logs & Replay */}
      {drawerWebhook && (
        <WebhookDeliveryDrawer
          open={Boolean(drawerWebhook)}
          onClose={() => setDrawerWebhook(null)}
          webhook={drawerWebhook}
        />
      )}

      {/* 6. Modal: Developer Verification Guide */}
      <WebhookVerificationGuideModal
        open={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </>
  );
};

export default Webhooks;
