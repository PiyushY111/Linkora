import { getRedis } from './cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Redis Streams producer for non-blocking click event buffering.
 * Never awaited on the redirect hot path — callers fire this after the
 * response has already been sent.
 */

/**
 * Flattens an object into the field/value pairs XADD expects, stringifying
 * every value (Redis stream fields are always strings).
 * @param {Record<string, unknown>} fields
 * @returns {string[]}
 */
function toXAddArgs(fields) {
  const args = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    args.push(key, String(value));
  }
  return args;
}

/**
 * @param {{
 *   linkId: string,
 *   shortCode: string,
 *   ip: string,
 *   ua: string,
 *   referer: string,
 *   timestamp: number,
 *   userId?: string,
 *   workspaceId?: string,
 *   destinationUrl?: string,
 *   utmSource?: string,
 *   utmMedium?: string,
 *   utmCampaign?: string,
 * }} click
 */
export async function emitClickEvent(click) {
  try {
    await getRedis().xadd(env.CLICK_STREAM_KEY, 'MAXLEN', '~', env.CLICK_STREAM_MAXLEN, '*', ...toXAddArgs(click));
  } catch (err) {
    // Never let stream ingestion failures affect the redirect response;
    // the caller has already responded to the client by this point.
    logger.error({ err, shortCode: click.shortCode }, 'Failed to XADD click event');
  }
}

/**
 * Every stream is capped: `maxLen` is required, and trimming is
 * approximate (MAXLEN ~), which lets Redis drop whole macro-nodes cheaply.
 * @param {string} streamKey
 * @param {Record<string, unknown>} fields
 * @param {number} maxLen
 */
export async function addToStream(streamKey, fields, maxLen) {
  try {
    return await getRedis().xadd(streamKey, 'MAXLEN', '~', maxLen, '*', ...toXAddArgs(fields));
  } catch (err) {
    logger.error({ err, streamKey }, 'Failed to XADD to stream');
    return null;
  }
}

export default { emitClickEvent, addToStream };
