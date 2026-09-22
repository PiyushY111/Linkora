import client from 'prom-client';
import { env } from '../config/env.js';

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

export const mongodbQueryDurationSeconds = new client.Histogram({
  name: 'mongodb_query_duration_seconds',
  help: 'MongoDB query duration in seconds',
  labelNames: ['collection', 'operation'],
  buckets: DURATION_BUCKETS,
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
 * Protects /metrics with a bearer token when METRICS_TOKEN is configured.
 * With no token configured, access is restricted to loopback only.
 */
export const metricsAuth = (req, res, next) => {
  if (env.METRICS_TOKEN) {
    const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (provided === env.METRICS_TOKEN) return next();
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const ip = req.socket.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
  return res.status(403).json({ success: false, message: 'Forbidden' });
};

export const metricsHandler = async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
};
