/**
 * Enterprise Bot & Social Crawler Detector
 *
 * Categorizes inbound requests to:
 * 1. Allow Social Preview Crawlers (Slack, Twitter/X, Discord, LinkedIn, etc.) to receive
 *    OpenGraph SSR HTML without counting them as human clicks or 307-redirecting them away.
 * 2. Tag automated scrapers and search bots in telemetry to prevent analytics pollution.
 */

const SOCIAL_CRAWLERS = [
  { name: 'Twitter/X Bot', regex: /twitterbot/i },
  { name: 'Facebook Crawler', regex: /facebookexternalhit|facebookcatalog/i },
  { name: 'LinkedIn Bot', regex: /linkedinbot/i },
  { name: 'Slackbot', regex: /slackbot|slack-imgproxy/i },
  { name: 'Discordbot', regex: /discordbot/i },
  { name: 'Telegram Bot', regex: /telegrambot/i },
  { name: 'WhatsApp Bot', regex: /whatsapp/i },
  { name: 'Pinterest Bot', regex: /pinterestbot/i },
  { name: 'Skype Bot', regex: /skypeuripreview/i },
  { name: 'iMessage Crawler', regex: /applebot|facebookexternalhit.*apple/i },
];

const SEARCH_ENGINE_BOTS = [
  { name: 'Googlebot', regex: /googlebot/i },
  { name: 'Bingbot', regex: /bingbot|bingpreview/i },
  { name: 'DuckDuckBot', regex: /duckduckbot/i },
  { name: 'Baiduspider', regex: /baiduspider/i },
  { name: 'YandexBot', regex: /yandexbot/i },
  { name: 'Applebot', regex: /applebot/i },
];

const AUTOMATED_SCRAPERS = [
  { name: 'curl', regex: /^curl\//i },
  { name: 'Wget', regex: /^wget\//i },
  { name: 'Python Requests', regex: /python-requests|python-urllib/i },
  { name: 'Go HTTP', regex: /go-http-client/i },
  { name: 'Node Fetch / Axios', regex: /node-fetch|axios/i },
  { name: 'Postman / Insomnia', regex: /postmanruntime|insomnia/i },
  { name: 'Headless Browser', regex: /headlesschrome|phantomjs|puppeteer|playwright/i },
];

/**
 * Detects if a user agent string belongs to a bot or crawler.
 * @param {string} userAgent
 * @returns {{ isBot: boolean, botName: string | null, isSocialCrawler: boolean, category: 'social' | 'search' | 'scraper' | null }}
 */
export function detectBot(userAgent = '') {
  if (!userAgent || typeof userAgent !== 'string') {
    return { isBot: false, botName: null, isSocialCrawler: false, category: null };
  }

  // 1. Check social crawlers (highest priority for OpenGraph interception)
  for (const crawler of SOCIAL_CRAWLERS) {
    if (crawler.regex.test(userAgent)) {
      return {
        isBot: true,
        botName: crawler.name,
        isSocialCrawler: true,
        category: 'social',
      };
    }
  }

  // 2. Check search engine bots
  for (const bot of SEARCH_ENGINE_BOTS) {
    if (bot.regex.test(userAgent)) {
      return {
        isBot: true,
        botName: bot.name,
        isSocialCrawler: false,
        category: 'search',
      };
    }
  }

  // 3. Check automated scrapers
  for (const scraper of AUTOMATED_SCRAPERS) {
    if (scraper.regex.test(userAgent)) {
      return {
        isBot: true,
        botName: scraper.name,
        isSocialCrawler: false,
        category: 'scraper',
      };
    }
  }

  // Generic fallback bot check
  if (/bot|crawler|spider|scraper|crawl/i.test(userAgent)) {
    return {
      isBot: true,
      botName: 'Generic Crawler',
      isSocialCrawler: false,
      category: 'scraper',
    };
  }

  return {
    isBot: false,
    botName: null,
    isSocialCrawler: false,
    category: null,
  };
}
