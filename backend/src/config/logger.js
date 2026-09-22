import crypto from 'crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from './env.js';

const isDev = env.NODE_ENV !== 'production';

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname,responseTime',
        singleLine: true,
      },
    },
  }),
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
  customSuccessMessage: (req, res, responseTime) => {
    return `${req.method} ${req.url} ${res.statusCode} (${responseTime}ms)`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} (${res.responseTime || 0}ms) - ${err.message}`;
  },
  // In development, strip giant request and response headers (CSP, cookies, sec-ch-ua)
  // so the terminal output stays concise and readable. In production, keep standard serializers.
  serializers: {
    req: isDev ? () => undefined : pinoHttp.stdSerializers.req,
    res: isDev ? () => undefined : pinoHttp.stdSerializers.res,
  },
  customProps: (req) => (isDev ? {} : { requestId: req.id }),
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/metrics',
  },
});

export default logger;

