import { env } from './env.js';
import { createOriginPolicy } from '../lib/originPolicy.js';

/**
 * The origin policy for this process (see lib/originPolicy.js), built from
 * the validated environment. Shared by CORS in app.js and the CSRF check in
 * middleware/csrf.js.
 */
export const isAllowedOrigin = createOriginPolicy({
  frontendUrl: env.FRONTEND_URL,
  allowedOrigins: env.ALLOWED_ORIGINS,
  nodeEnv: env.NODE_ENV,
});

export default isAllowedOrigin;
