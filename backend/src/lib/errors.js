/**
 * Typed application errors. Every error thrown from a controller should be
 * one of these (or a plain Error, which the global handler treats as a
 * 500 and never exposes to the client) so middleware/error.js can map it to
 * the correct status code without controllers ever touching res.status().
 */
export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    // Only AppError (and subclasses) messages are safe to send to clients;
    // the handler uses this flag to decide whether to expose err.message.
    this.expose = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Not authorized') {
    super(message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

export class GoneError extends AppError {
  constructor(message = 'No longer available') {
    super(message, 410);
  }
}

/**
 * The request's IP isn't on the organization's allowlist. Carries a
 * machine-readable `code` so clients can tell it apart from a role 403.
 */
export class IpNotAllowedError extends ForbiddenError {
  constructor(ip) {
    super(`Your IP address (${ip}) isn't on this organization's allowlist. Ask an owner to add it.`);
    this.code = 'IP_NOT_ALLOWED';
  }
}

/**
 * The member is managed by the organization's identity provider (directory
 * sync / SCIM), so they're added and removed there, not by hand.
 */
export class DirectoryManagedError extends ConflictError {
  constructor(message = "This person is managed by your organization's identity provider. Add or remove them there.") {
    super(message);
    this.code = 'DIRECTORY_MANAGED';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

/**
 * Maps a MongoDB duplicate-key error (E11000) to the field that collided,
 * for a slightly more useful 409 message than a raw driver error.
 */
function duplicateKeyField(err) {
  const match = /index:\s*([^\s]+?)(?:_\d+)?\s/.exec(err.message || '');
  const keyPattern = err.keyPattern && Object.keys(err.keyPattern)[0];
  return keyPattern || (match ? match[1] : 'field');
}

/**
 * The single rule for which errors are safe to show a client. Returns the
 * status and message to send, or null for anything unexpected, whose
 * message must never leave the server.
 * @param {unknown} err
 * @returns {{ status: number, message: string, code?: string } | null}
 */
export function toClientError(err) {
  if (err instanceof AppError) {
    // `code` only ever comes from our own typed errors (never a driver's).
    return { status: err.status, message: err.message, ...(typeof err.code === 'string' && { code: err.code }) };
  }

  if (err?.code === 11000) {
    return { status: 409, message: `A record with this ${duplicateKeyField(err)} already exists` };
  }

  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return { status: 413, message: 'Request payload too large (maximum 10MB)' };
  }

  if (err?.name === 'ValidationError' && err.errors) {
    // Mongoose schema validation error — safe to surface field-level messages.
    const firstMessage = Object.values(err.errors)[0]?.message || 'Validation failed';
    return { status: 400, message: firstMessage };
  }

  return null;
}

export default {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  GoneError,
  IpNotAllowedError,
  DirectoryManagedError,
  RateLimitError,
  toClientError,
};
