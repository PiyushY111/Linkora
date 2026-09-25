/**
 * Utility functions to resolve the hosted domain and origin dynamically.
 * Eliminates hardcoded domain strings and ensures the UI always adapts
 * to whatever domain the user or environment hosts the application on.
 */

export function getHostedDomain() {
  const envCustom =
    import.meta.env.VITE_SHORT_DOMAIN ||
    import.meta.env.VITE_PUBLIC_URL ||
    import.meta.env.VITE_FRONTEND_URL;

  if (envCustom) {
    try {
      const url = envCustom.startsWith('http://') || envCustom.startsWith('https://')
        ? new URL(envCustom)
        : new URL(`https://${envCustom}`);
      return url.host;
    } catch {
      return envCustom.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    }
  }

  if (typeof window !== 'undefined' && window.location?.host) {
    return window.location.host;
  }

  return 'localhost:3000';
}

export function getHostedOrigin() {
  const envCustom =
    import.meta.env.VITE_PUBLIC_URL ||
    import.meta.env.VITE_FRONTEND_URL;

  if (envCustom) {
    return envCustom.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'http://localhost:3000';
}
