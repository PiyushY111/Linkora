import { mongoAnalyticsRepository } from './mongoAnalyticsRepository.js';

/**
 * The one boundary between click analytics and whatever stores it. The
 * controller and the click consumer only ever talk to this interface, so a
 * different store (e.g. a ClickHouse implementation, see
 * docs/adr/0005-analytics-on-mongodb.md) can be added behind it without
 * touching either of them.
 *
 * @typedef {Object} ClickEventRecord
 * @property {string} eventId - stream entry ID; the idempotency key
 * @property {string} linkId
 * @property {string} userId
 * @property {string} shortCode
 * @property {Date} timestamp
 * @property {string} ipHash
 * @property {string} referrerDomain - '' for direct traffic
 * @property {string} device
 * @property {string} browser
 * @property {string} os
 * @property {string} country - ISO 3166-1 alpha-2, '' if unknown
 * @property {string} city
 * @property {string} utmSource
 * @property {string} utmMedium
 * @property {string} utmCampaign
 * @property {string | null} variantId
 * @property {string | null} variantName
 * @property {boolean} isBot
 * @property {string | null} botName
 *
 * @typedef {Object} TimeInfo - output of calculateTimeRange()
 * @property {Date} start
 * @property {Date} end
 * @property {Date} priorStart
 * @property {Date} priorEnd
 * @property {'hour' | 'day' | 'month'} granularity
 * @property {string} timeRange
 *
 * @typedef {Object} AnalyticsRepository
 * @property {(events: ClickEventRecord[]) => Promise<{ applied: ClickEventRecord[] }>} recordClicks
 *   Persists a batch. Must be idempotent per eventId: re-recording an event
 *   already recorded is a no-op. Returns the events that were newly applied.
 * @property {(linkId: string, timeInfo: TimeInfo, options: { excludeBots: boolean }) => Promise<object>} getLinkAnalytics
 * @property {(userId: string, timeInfo: TimeInfo) => Promise<object>} getUserSummary
 * @property {(filter: { linkId?: string, userId: string, start: Date, end: Date, limit: number }) => AsyncIterable<object>} exportEvents
 */

/** @returns {AnalyticsRepository} */
export function getAnalyticsRepository() {
  return mongoAnalyticsRepository;
}
