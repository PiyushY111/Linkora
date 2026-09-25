import { env } from '../config/env.js';

export const validateUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * The client IP that rate limits, failed-login counters, audit logs and
 * click analytics key on. It comes from Express's `req.ip`, which walks
 * X-Forwarded-For back only as many hops as `trust proxy` allows
 * (TRUST_PROXY_HOPS), so a client can't choose its own IP by sending
 * X-Forwarded-For or X-Real-IP. CF-Connecting-IP is read only when
 * TRUST_CLOUDFLARE is set.
 * @param {import('express').Request} req
 * @returns {string}
 */
export const getClientIp = (req) => {
  const cloudflareIp = env.TRUST_CLOUDFLARE ? req.headers['cf-connecting-ip'] : undefined;
  const raw =
    (typeof cloudflareIp === 'string' && cloudflareIp.trim()) || req.ip || req.socket?.remoteAddress || '127.0.0.1';
  return String(raw).replace(/^::ffff:/, '');
};

export const getUserAgent = (req) => {
  return req.headers['user-agent'] || '';
};

export const parseUserAgent = (userAgentString) => {
  // Simple user agent parser - in production, use 'ua-parser-js' library
  const isMobile = /mobile|android|iphone/i.test(userAgentString);
  const isTablet = /tablet|ipad/i.test(userAgentString);
  
  let device = 'desktop';
  if (isMobile) device = 'mobile';
  if (isTablet) device = 'tablet';

  return {
    device,
    browser: extractBrowser(userAgentString),
    os: extractOS(userAgentString),
  };
};

const extractBrowser = (ua) => {
  const browsers = [
    { name: 'Chrome', regex: /Chrome\/(\d+)/ },
    { name: 'Firefox', regex: /Firefox\/(\d+)/ },
    { name: 'Safari', regex: /Version\/(\d+).*Safari/ },
    { name: 'Edge', regex: /Edg\/(\d+)/ },
  ];

  for (const { name, regex } of browsers) {
    if (regex.test(ua)) return name;
  }
  return 'Unknown';
};

const extractOS = (ua) => {
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  return 'Unknown';
};

export const shortenUrl = (longUrl) => {
  try {
    const url = new URL(longUrl);
    return url.hostname;
  } catch {
    return longUrl;
  }
};
