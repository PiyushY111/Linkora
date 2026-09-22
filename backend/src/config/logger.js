import crypto from 'crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'password',
      '*.password',
      'req.body.password',
      'token',
      '*.token',
      'authorization',
      'req.headers.authorization',
      'cookie',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'apiKey',
      '*.apiKey',
      'req.headers["x-api-key"]',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Generates request IDs in the format c_<timestamp>_<random_hex>.
 */
export function generateRequestId() {
  return `c_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = typeof existing === 'string' && existing.length > 0 ? existing : generateRequestId();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: (req) => ({ requestId: req.id }),
});

export default logger;
