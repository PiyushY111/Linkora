import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { toClientError } from '../lib/errors.js';

export const errorHandler = (err, req, res, next) => {
  const log = req.log || logger;
  log.error({ err, requestId: req.id }, 'Unhandled request error');

  const clientError = toClientError(err);
  if (clientError) {
    return res.status(clientError.status).json({ success: false, message: clientError.message });
  }

  // Anything else is an unexpected server-side failure: never leak err.message
  // or a stack trace to the client, even in development-adjacent environments.
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    requestId: req.id,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
};
