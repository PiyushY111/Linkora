import CircuitBreaker from 'opossum';
import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import Link from '../models/Link.js';
import { invalidateLinkMeta } from './cacheService.js';
import { dispatchEvent } from './webhookService.js';

const BREAKER_OPTIONS = {
  timeout: 3000, // Phase 6.3: 3s timeout
  errorThresholdPercentage: 50, // Phase 6.3: 50% error trip threshold
  resetTimeout: 30000,
};

async function callSafeBrowsing(url) {
  // The key goes in a header, not ?key=, so it never lands in URL logs.
  const response = await fetch(
    'https://safebrowsing.googleapis.com/v4/threatMatches:find',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.SAFE_BROWSING_API_KEY },
      body: JSON.stringify({
        client: { clientId: 'linkora', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      }),
      signal: AbortSignal.timeout(BREAKER_OPTIONS.timeout),
    }
  );
  if (!response.ok) throw new Error(`Safe Browsing API returned ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.matches) && data.matches.length > 0;
}

async function callVirusTotal(url) {
  const urlId = Buffer.from(url).toString('base64url').replace(/=+$/, '');
  const response = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
    headers: { 'x-apikey': env.VIRUSTOTAL_API_KEY },
    signal: AbortSignal.timeout(BREAKER_OPTIONS.timeout),
  });
  if (response.status === 404) return false; // never scanned; treat as not-flagged
  if (!response.ok) throw new Error(`VirusTotal API returned ${response.status}`);
  const data = await response.json();
  const stats = data.data?.attributes?.last_analysis_stats;
  return Boolean(stats && (stats.malicious > 0 || stats.suspicious > 0));
}

const safeBrowsingBreaker = new CircuitBreaker(callSafeBrowsing, BREAKER_OPTIONS);
const virusTotalBreaker = new CircuitBreaker(callVirusTotal, BREAKER_OPTIONS);

for (const [name, breaker] of [
  ['safe-browsing', safeBrowsingBreaker],
  ['virustotal', virusTotalBreaker],
]) {
  breaker.on('open', () => logger.warn({ breaker: name }, 'Circuit breaker opened'));
  breaker.on('close', () => logger.info({ breaker: name }, 'Circuit breaker closed'));
  breaker.fallback(() => {
    logger.warn({ breaker: name }, 'Threat detection call failed/short-circuited; failing open (not flagging)');
    return false;
  });
}

/**
 * Checks a URL against configured threat intel providers. Fails open (does
 * not block link creation) when no provider is enabled, or when a
 * provider's circuit breaker is open/times out — an outage in a third-party
 * safety API shouldn't take down link creation.
 * @param {string} url
 * @returns {Promise<{ malicious: boolean, source: string | null }>}
 */
export async function checkUrlThreat(url) {
  if (env.SAFE_BROWSING_ENABLED) {
    const malicious = await safeBrowsingBreaker.fire(url);
    if (malicious) return { malicious: true, source: 'google-safe-browsing' };
  }

  if (env.VIRUSTOTAL_ENABLED) {
    const malicious = await virusTotalBreaker.fire(url);
    if (malicious) return { malicious: true, source: 'virustotal' };
  }

  return { malicious: false, source: null };
}

const RESCAN_BATCH_SIZE = 100;

/**
 * Re-verifies active links in batches, flipping isActive=false and
 * abuseFlag=true on a hit. Runs every 12h; no-ops when no provider is
 * configured.
 */
export async function rescanActiveLinksForAbuse() {
  if (!env.SAFE_BROWSING_ENABLED && !env.VIRUSTOTAL_ENABLED) return;

  let processed = 0;
  let flagged = 0;
  let lastId = null;

  for (;;) {
    const query = { isActive: true, abuseFlag: { $ne: true } };
    if (lastId) query._id = { $gt: lastId };

    const batch = await Link.find(query).sort({ _id: 1 }).limit(RESCAN_BATCH_SIZE).lean();
    if (batch.length === 0) break;

    for (const link of batch) {
      try {
        const { malicious, source } = await checkUrlThreat(link.originalUrl);
        if (malicious) {
          await Link.findByIdAndUpdate(link._id, { isActive: false, abuseFlag: true });
          await invalidateLinkMeta(link.shortCode);
          if (link.customAlias) await invalidateLinkMeta(link.customAlias);
          dispatchEvent(link.workspace, 'abuse.flagged', {
            linkId: String(link._id),
            shortCode: link.shortCode,
            originalUrl: link.originalUrl,
            source,
          }).catch((err) => logger.error({ err }, 'Failed to dispatch abuse.flagged webhook'));
          flagged += 1;
          logger.warn({ linkId: link._id, source }, 'Link flagged as abusive by background rescan');
        }
      } catch (err) {
        logger.error({ err, linkId: link._id }, 'Abuse rescan failed for link');
      }
      processed += 1;
    }

    lastId = batch[batch.length - 1]._id;
  }

  logger.info({ processed, flagged }, 'Abuse rescan cycle complete');
}

/**
 * Schedules the 12-hourly background re-verification of active links.
 * @returns {import('node-cron').ScheduledTask | null} null when disabled
 */
export function scheduleAbuseRescan() {
  if (!env.SAFE_BROWSING_ENABLED && !env.VIRUSTOTAL_ENABLED) return null;

  return cron.schedule('0 */12 * * *', () => {
    rescanActiveLinksForAbuse().catch((err) => logger.error({ err }, 'Scheduled abuse rescan failed'));
  });
}

export default { checkUrlThreat, rescanActiveLinksForAbuse, scheduleAbuseRescan };
