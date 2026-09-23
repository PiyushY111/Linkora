import { describe, it } from 'vitest';
import assert from 'node:assert';
import { detectBot } from '../../src/utils/botDetector.js';

describe('Bot & Social Crawler Detector', () => {
  it('correctly identifies Twitterbot as a social crawler', () => {
    const ua = 'Twitterbot/1.0';
    const result = detectBot(ua);
    assert.strictEqual(result.isBot, true);
    assert.strictEqual(result.isSocialCrawler, true);
    assert.strictEqual(result.botName, 'Twitter/X Bot');
  });

  it('correctly identifies Slackbot as a social crawler', () => {
    const ua = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';
    const result = detectBot(ua);
    assert.strictEqual(result.isBot, true);
    assert.strictEqual(result.isSocialCrawler, true);
    assert.strictEqual(result.botName, 'Slackbot');
  });

  it('correctly identifies Googlebot as search bot (not social)', () => {
    const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    const result = detectBot(ua);
    assert.strictEqual(result.isBot, true);
    assert.strictEqual(result.isSocialCrawler, false);
    assert.strictEqual(result.category, 'search');
  });

  it('correctly identifies automated scrapers (curl, python)', () => {
    assert.strictEqual(detectBot('curl/7.88.1').isBot, true);
    assert.strictEqual(detectBot('python-requests/2.31.0').isBot, true);
  });

  it('correctly identifies legitimate desktop Chrome as a human', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const result = detectBot(ua);
    assert.strictEqual(result.isBot, false);
    assert.strictEqual(result.isSocialCrawler, false);
  });
});
