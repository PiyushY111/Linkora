import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Webhook as WebhookIcon, Plus, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import WebhookCard from '../components/webhooks/WebhookCard';
import WebhookTestModal from '../components/webhooks/WebhookTestModal';
import WebhookDeliveryDrawer from '../components/webhooks/WebhookDeliveryDrawer';
import WebhookVerificationGuideModal from '../components/webhooks/WebhookVerificationGuideModal';
import { useConfirm } from '../context/ConfirmContext';
import useWebhooks from './webhooks/useWebhooks';
import WebhookStatsCards from './webhooks/WebhookStatsCards';
import CreateWebhookModal from './webhooks/CreateWebhookModal';
import EditWebhookModal from './webhooks/EditWebhookModal';
import SecretRevealModal from './webhooks/SecretRevealModal';

const Webhooks = () => {
  const confirm = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editWebhook, setEditWebhook] = useState(null);
  const [activeSecretModal, setActiveSecretModal] = useState(null); // { secret, title, subtitle }
  const [testModalWebhook, setTestModalWebhook] = useState(null);
  const [drawerWebhook, setDrawerWebhook] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  const { webhooks, isLoading, stats, fetchWebhooks, handleToggleActive, handleRotateSecret, handleDelete } =
    useWebhooks({ confirm, showSecret: setActiveSecretModal });

  const handleCreated = (secret) => {
    setActiveSecretModal({
      secret,
      title: 'Webhook Endpoint Provisioned',
      subtitle:
        'Save this signing secret now — it cannot be viewed again. Verify the Linkora-Signature header on every payload using this secret.',
    });
    toast.success('Webhook created successfully');
    fetchWebhooks();
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

        {webhooks.length > 0 && <WebhookStatsCards stats={stats} />}

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

      <CreateWebhookModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={handleCreated} />

      {editWebhook && (
        <EditWebhookModal
          editWebhook={editWebhook}
          setEditWebhook={setEditWebhook}
          onClose={() => setEditWebhook(null)}
          onSaved={fetchWebhooks}
        />
      )}

      {/* Shown once upon creation or rotation */}
      {activeSecretModal && (
        <SecretRevealModal secretInfo={activeSecretModal} onClose={() => setActiveSecretModal(null)} />
      )}

      {testModalWebhook && (
        <WebhookTestModal
          open={Boolean(testModalWebhook)}
          onClose={() => setTestModalWebhook(null)}
          webhook={testModalWebhook}
          onTestComplete={fetchWebhooks}
        />
      )}

      {drawerWebhook && (
        <WebhookDeliveryDrawer
          open={Boolean(drawerWebhook)}
          onClose={() => setDrawerWebhook(null)}
          webhook={drawerWebhook}
        />
      )}

      <WebhookVerificationGuideModal
        open={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </>
  );
};

export default Webhooks;
