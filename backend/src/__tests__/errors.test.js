import { describe, it } from 'vitest';
import assert from 'node:assert';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
} from '../lib/errors.js';
import { errorHandler } from '../middleware/error.js';
import { env } from '../config/env.js';

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('AppError hierarchy', () => {
  it('assigns the right HTTP status per subclass', () => {
    assert.strictEqual(new ValidationError().status, 400);
    assert.strictEqual(new UnauthorizedError().status, 401);
    assert.strictEqual(new ForbiddenError().status, 403);
    assert.strictEqual(new NotFoundError().status, 404);
    assert.strictEqual(new ConflictError().status, 409);
    assert.strictEqual(new RateLimitError().status, 429);
  });

  it('is an instanceof AppError and Error', () => {
    const err = new NotFoundError('missing');
    assert.ok(err instanceof AppError);
    assert.ok(err instanceof Error);
    assert.strictEqual(err.message, 'missing');
  });
});

describe('errorHandler middleware', () => {
  it('maps an AppError to its own status and message', () => {
    const res = mockRes();
    const req = { id: 'req-1', log: { error() {} } };
    errorHandler(new ConflictError('alias taken'), req, res, () => {});
    assert.strictEqual(res.statusCode, 409);
    assert.deepStrictEqual(res.body, { success: false, message: 'alias taken' });
  });

  it('maps a Mongo duplicate-key error (11000) to 409', () => {
    const res = mockRes();
    const req = { id: 'req-2', log: { error() {} } };
    const dupErr = new Error('E11000 duplicate key error index: links.$shortCode_1 dup key');
    dupErr.code = 11000;
    dupErr.keyPattern = { shortCode: 1 };
    errorHandler(dupErr, req, res, () => {});
    assert.strictEqual(res.statusCode, 409);
    assert.match(res.body.message, /shortCode/);
  });

  it('never leaks a raw error message or stack trace outside development', () => {
    const originalEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      const res = mockRes();
      const req = { id: 'req-3', log: { error() {} } };
      errorHandler(new Error('super secret internal detail'), req, res, () => {});
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.body.message, 'Internal server error');
      assert.strictEqual(res.body.stack, undefined);
      assert.ok(!JSON.stringify(res.body).includes('super secret internal detail'));
      assert.strictEqual(res.body.requestId, 'req-3');
    } finally {
      env.NODE_ENV = originalEnv;
    }
  });

  it('always keeps the client-facing message generic, even in development', () => {
    const res = mockRes();
    const req = { id: 'req-3b', log: { error() {} } };
    errorHandler(new Error('super secret internal detail'), req, res, () => {});
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.message, 'Internal server error');
  });

  it('maps a Mongoose ValidationError to a 400 with the field message', () => {
    const res = mockRes();
    const req = { id: 'req-4', log: { error() {} } };
    const validationErr = new Error('Validation failed');
    validationErr.name = 'ValidationError';
    validationErr.errors = { email: { message: 'Please provide a valid email' } };
    errorHandler(validationErr, req, res, () => {});
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.message, 'Please provide a valid email');
  });
});
