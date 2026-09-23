import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../lib/errors.js';

/**
 * Maps a MongoDB duplicate-key error (E11000) to the field that collided,
 * for a slightly more useful 409 message than a raw driver error.
 */
function duplicateKeyField(err) {
  const match = /index:\s*([^\s]+?)(?:_\d+)?\s/.exec(err.message || '');
  const keyPattern = err.keyPattern && Object.keys(err.keyPattern)[0];
  return keyPattern || (match ? match[1] : 'field');
}

export const errorHandler = (err, req, res, next) => {
  const log = req.log || logger;
  log.error({ err, requestId: req.id }, 'Unhandled request error');

  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: `A record with this ${duplicateKeyField(err)} already exists`,
    });
  }

  if (err.name === 'ValidationError' && err.errors) {
    // Mongoose schema validation error — safe to surface field-level messages.
    const firstMessage = Object.values(err.errors)[0]?.message || 'Validation failed';
    return res.status(400).json({ success: false, message: firstMessage });
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
