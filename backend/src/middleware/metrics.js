import client from 'prom-client';
import { env } from '../config/env.js';
import { constantTimeEqual } from '../utils/constantTimeEqual.js';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const DURATION_BUCKETS = [0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['route', 'method', 'status_code'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['route', 'method', 'status_code'],
  buckets: DURATION_BUCKETS,
  registers: [registry],
});

export const redisCacheHitsTotal = new client.Counter({
  name: 'redis_cache_hits_total',
  help: 'Total Redis cache hits',
  labelNames: ['operation'],
  registers: [registry],
});

export const redisCacheMissesTotal = new client.Counter({
  name: 'redis_cache_misses_total',
  help: 'Total Redis cache misses',
  labelNames: ['operation'],
  registers: [registry],
});

export const redisXfetchEarlyRefreshesTotal = new client.Counter({
  name: 'redis_xfetch_early_refreshes_total',
  help: 'Total XFetch probabilistic early-expiration recomputations triggered',
  registers: [registry],
});

export const mongodbQueryDurationSeconds = new client.Histogram({
  name: 'mongodb_query_duration_seconds',
  help: 'MongoDB query duration in seconds',
  labelNames: ['collection', 'operation'],
  buckets: DURATION_BUCKETS,
  registers: [registry],
});

export const webhookDeliveriesTotal = new client.Counter({
  name: 'webhook_deliveries_total',
  help: 'Webhook delivery attempts by result (succeeded, failed, retry_scheduled, cancelled)',
  labelNames: ['outcome'],
  registers: [registry],
});

export const webhookAttemptDurationSeconds = new client.Histogram({
  name: 'webhook_attempt_duration_seconds',
  help: 'Wall time of one webhook HTTP attempt, including DNS re-resolution',
  labelNames: ['outcome'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * Queue depth and age of the oldest due delivery, computed on scrape by
 * whoever registers a sampler (the webhook queue module), so this file
 * doesn't import models.
 * @type {(() => Promise<{ pending: number, oldestPendingAgeSeconds: number }>) | null}
 */
let webhookQueueSampler = null;
export function setWebhookQueueSampler(sampler) {
  webhookQueueSampler = sampler;
}

const webhookPendingGauge = new client.Gauge({
  name: 'webhook_deliveries_pending',
  help: 'Deliveries waiting for a worker (due or scheduled)',
  registers: [registry],
  async collect() {
    if (!webhookQueueSampler) return;
    const sample = await webhookQueueSampler();
    webhookPendingGauge.set(sample.pending);
    webhookOldestPendingGauge.set(sample.oldestPendingAgeSeconds);
  },
});

const webhookOldestPendingGauge = new client.Gauge({
  name: 'webhook_oldest_due_delivery_age_seconds',
  help: 'How long the longest-waiting due delivery has been waiting for a worker',
  registers: [registry],
});

function routeLabel(req) {
  return req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
}

export const metricsMiddleware = (req, res, next) => {
  const endTimer = httpRequestDurationSeconds.startTimer();
  res.on('finish', () => {
    const labels = { route: routeLabel(req), method: req.method, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    endTimer(labels);
  });
  next();
};

/**
 * Protects /metrics with a bearer token when METRICS_TOKEN is configured
 * (compared in constant time). With no token configured, access falls back
 * to a loopback-only check — but only outside production, since behind a
 * reverse proxy `req.socket.remoteAddress` is the proxy's address, not the
 * real client's, making that fallback unreliable. In production with no
 * token set, /metrics fails closed instead.
 */
export const metricsAuth = (req, res, next) => {
  if (env.METRICS_TOKEN) {
    const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    if (constantTimeEqual(provided, env.METRICS_TOKEN)) return next();
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const ip = req.socket.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
  return res.status(403).json({ success: false, message: 'Forbidden' });
};

export const metricsHandler = async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
};
