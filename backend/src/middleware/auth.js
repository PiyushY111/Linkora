import User from '../models/User.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { resolveActiveWorkspace } from '../services/workspaceService.js';

/**
 * Authenticates the bearer token and attaches the caller plus the workspace
 * they're acting in: req.user, req.activeWorkspace, req.activeMembership
 * ({ user, role }). Workspace-owned resources are scoped by
 * req.activeWorkspace._id; see requireActiveRole in rbac.js for role checks.
 */
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  // Outside the try above: a database failure here is a 500 for the error
  // handler, not an authentication failure.
  req.user = await User.findById(decoded.id);
  if (!req.user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const { workspace, membership } = await resolveActiveWorkspace(req.user);
  req.activeWorkspace = workspace;
  req.activeMembership = membership;

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
