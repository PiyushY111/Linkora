import WebhookDelivery from '../models/WebhookDelivery.js';
import { setWebhookQueueSampler } from '../middleware/metrics.js';

/**
 * Wires the webhook queue gauges (webhook_deliveries_pending,
 * webhook_oldest_due_delivery_age_seconds) to the delivery collection.
 * Sampled on each /metrics scrape, never on a timer.
 */
export function registerWebhookQueueMetrics() {
  setWebhookQueueSampler(async () => {
    const now = new Date();
    const [pending, oldestDue] = await Promise.all([
      WebhookDelivery.countDocuments({ status: 'pending' }),
      WebhookDelivery.findOne({ status: 'pending', nextAttemptAt: { $lte: now } })
        .sort({ nextAttemptAt: 1 })
        .select('nextAttemptAt')
        .lean(),
    ]);
    const oldestPendingAgeSeconds = oldestDue ? Math.max(0, (now - oldestDue.nextAttemptAt) / 1000) : 0;
    return { pending, oldestPendingAgeSeconds };
  });
}

export default registerWebhookQueueMetrics;
