import { z } from 'zod';
import validator from 'validator';

/**
 * Request-body validation. Each field is a zod schema whose steps (sanitize
 * or check) are validator.js functions: zod's own url()/email() are looser
 * than validator's isURL/isEmail, and stored emails depend on validator's
 * normalizeEmail (it strips dots and +tags from Gmail addresses), so the
 * rules stay validator.js.
 *
 * Behavior deliberately matches the express-validator chains this replaced:
 * non-string input is coerced the same way, an optional field skips any
 * step while its value is falsy, sanitized values are written back to
 * req.body, and a failure returns
 *   400 { success: false, message, errors: [{ value, msg, param, location }] }
 * with `message` being the first error.
 */

/** express-validator's coercion: an array's first element, '' for null/undefined/NaN. */
function toStr(value, deep = true) {
  if (Array.isArray(value) && value.length && deep) return toStr(value[0], false);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && value.toString) {
    return typeof value.toString === 'function' ? value.toString() : Object.getPrototypeOf(value).toString.call(value);
  }
  if (value == null || (Number.isNaN(Number(value)) && !value.length)) return '';
  return String(value);
}

const sanitize = (fn) => ({ sanitize: fn });
const check = (fn, message) => ({ check: fn, message });

const trim = sanitize((value) => validator.trim(toStr(value)));
const normalizeEmail = sanitize((value) => validator.normalizeEmail(toStr(value)));
const isEmail = check((str) => validator.isEmail(str), 'Please provide a valid email');

/**
 * @param {Array<{ sanitize: (value: unknown) => unknown } | { check: (str: string) => boolean, message: string }>} steps
 * @param {{ optional?: boolean }} [options] - optional: skip steps while the value is falsy
 */
function field(steps, { optional = false } = {}) {
  return z.unknown().transform((initial, ctx) => {
    let value = initial;
    for (const step of steps) {
      if (optional && !value) break;
      if (step.sanitize) {
        value = step.sanitize(value);
      } else if (!step.check(toStr(value))) {
        ctx.addIssue({ code: 'custom', message: step.message, params: { value } });
      }
    }
    return value;
  });
}

function toErrorResponse(issues) {
  const errors = issues.map((issue) => ({
    value: issue.params?.value,
    msg: issue.message,
    param: String(issue.path[0]),
    location: 'body',
  }));
  return { success: false, message: errors[0]?.msg || 'Validation error', errors };
}

/**
 * @param {Record<string, z.ZodType>} shape - one schema per body field
 * @returns {import('express').RequestHandler}
 */
function validateBody(shape) {
  const schema = z.object(shape);
  const fields = Object.keys(shape);

  return (req, res, next) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = schema.safeParse(Object.fromEntries(fields.map((name) => [name, body[name]])));
    if (!result.success) {
      return res.status(400).json(toErrorResponse(result.error.issues));
    }

    const changed = fields.filter((name) => result.data[name] !== body[name]);
    if (changed.length > 0) {
      req.body = { ...body, ...Object.fromEntries(changed.map((name) => [name, result.data[name]])) };
    }
    next();
  };
}

const withProtocol = sanitize((value) => {
  if (!value) return value;
  if (!/^https?:\/\//i.test(value)) return `https://${value}`;
  return value;
});

// A link destination as typed by a user: trimmed, https:// assumed.
const destinationUrlSteps = [trim, withProtocol, check((str) => validator.isURL(str), 'Please provide a valid URL')];

export const validateCreateLink = validateBody({
  originalUrl: field(destinationUrlSteps),
  customAlias: field(
    [
      trim,
      check(
        (str) => validator.matches(str, /^[a-z0-9-]+$/),
        'Custom alias can only contain lowercase letters, numbers, and hyphens'
      ),
    ],
    { optional: true }
  ),
  title: field([trim, check((str) => validator.isLength(str, { max: 200 }), 'Title cannot exceed 200 characters')], {
    optional: true,
  }),
  description: field([trim], { optional: true }),
});

// Adding a bio page item: either an existing linkId (checked in the
// controller) or a destinationUrl that becomes a new link.
export const validateBioPageItem = validateBody({
  destinationUrl: field(destinationUrlSteps, { optional: true }),
  label: field([
    trim,
    check((str) => !validator.isEmpty(str), 'Item label is required'),
    check((str) => validator.isLength(str, { max: 100 }), 'Item label cannot exceed 100 characters'),
  ]),
});

export const validateRegister = validateBody({
  name: field([
    trim,
    check((str) => !validator.isEmpty(str), 'Please provide a name'),
    check((str) => validator.isLength(str, { max: 50 }), 'Name cannot exceed 50 characters'),
  ]),
  email: field([isEmail, normalizeEmail]),
  password: field([check((str) => validator.isLength(str, { min: 6 }), 'Password must be at least 6 characters')]),
});

export const validateLogin = validateBody({
  email: field([isEmail, normalizeEmail]),
  password: field([check((str) => !validator.isEmpty(str), 'Password is required')]),
});
