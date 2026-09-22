import { body, validationResult } from 'express-validator';

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errs = errors.array();
    return res.status(400).json({
      success: false,
      message: errs[0]?.msg || 'Validation error',
      errors: errs,
    });
  }
  next();
};

export const validateCreateLink = [
  body('originalUrl')
    .trim()
    .customSanitizer((value) => {
      if (!value) return value;
      if (!/^https?:\/\//i.test(value)) return `https://${value}`;
      return value;
    })
    .isURL()
    .withMessage('Please provide a valid URL'),
  body('customAlias')
    .trim()
    .optional({ checkFalsy: true })
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Custom alias can only contain lowercase letters, numbers, and hyphens'),
  body('title')
    .trim()
    .optional({ checkFalsy: true })
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),
  body('description')
    .trim()
    .optional({ checkFalsy: true }),
];

export const validateRegister = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Please provide a name')
    .isLength({ max: 50 })
    .withMessage('Name cannot exceed 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];
