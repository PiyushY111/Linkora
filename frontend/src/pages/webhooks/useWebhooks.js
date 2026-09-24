import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { webhookService } from '../../services';

/**
 * The user's webhook endpoints: loading, summary stats, and the actions
 * that change them in place (pause/enable, rotate secret, delete).
 * @param {{ confirm: Function, showSecret: (info: { secret: string, title: string, subtitle: string }) => void }} deps
 */
export default function useWebhooks({ confirm, showSecret }) {
  const [webhooks, setWebhooks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWebhooks = async () => {
    setIsLoading(true);
    try {
      const data = await webhookService.list();
      setWebhooks(data.webhooks || []);
    } catch {
      toast.error('Failed to load webhooks');
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
      showSecret({
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

  return { webhooks, isLoading, stats, fetchWebhooks, handleToggleActive, handleRotateSecret, handleDelete };
}
