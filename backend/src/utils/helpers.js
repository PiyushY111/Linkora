export const validateUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

export const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket.remoteAddress ||
    req.connection.remoteAddress ||
    req.ip
  );
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
