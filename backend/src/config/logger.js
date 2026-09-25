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
      'secret',
      '*.secret',
      'jwtSecret',
      '*.jwtSecret',
      'cipherKey',
      '*.cipherKey',
      'signature',
      '*.signature',
      'webhookSecret',
      '*.webhookSecret',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const URL_SECRET_PATTERNS = [
  // Workspace invite links: /invite/<token> (frontend), /invites/<token> (API)
  [/(\/invites?\/)[^/?#\s]+/g, '$1[REDACTED]'],
  // Single-use password-link unlock tokens on the redirect route
  [/([?&]unlockToken=)[^&#\s]+/g, '$1[REDACTED]'],
];

/**
 * Strips bearer-style secrets that travel in URLs out of anything logged
 * (request line, url, Referer). Exported for tests.
 * @param {string} value
 */
export function redactUrlSecrets(value) {
  if (typeof value !== 'string') return value;
  return URL_SECRET_PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), value);
}

function serializeRequest(req) {
  const serialized = pinoHttp.stdSerializers.req(req);
  const headers = serialized.headers?.referer
    ? { ...serialized.headers, referer: redactUrlSecrets(serialized.headers.referer) }
    : serialized.headers;
  return { ...serialized, url: redactUrlSecrets(serialized.url), headers };
}

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
    return `${req.method} ${redactUrlSecrets(req.url)} ${res.statusCode} (${responseTime}ms)`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${redactUrlSecrets(req.url)} ${res.statusCode} (${res.responseTime || 0}ms) - ${err.message}`;
  },
  // In development, strip giant request and response headers (CSP, cookies, sec-ch-ua)
  // so the terminal output stays concise and readable. In production, keep standard serializers.
  serializers: {
    req: isDev ? () => undefined : serializeRequest,
    res: isDev ? () => undefined : pinoHttp.stdSerializers.res,
  },
  customProps: (req) => (isDev ? {} : { requestId: req.id }),
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/metrics',
  },
});

export default logger;

