import User from '../models/User.js';
import { verifyJwt } from '../utils/jwt.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  let decoded;
  try {
    decoded = verifyJwt(token);
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  req.user = await User.findById(decoded.id);
  // A valid token for an account that no longer exists is an authentication
  // failure (401), not a missing resource.
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  next();
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'User role is not authorized to access this route' });
    }
    next();
  };
};
