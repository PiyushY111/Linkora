import mongoose from 'mongoose';
import ClickEvent from '../../models/ClickEvent.js';
import { LinkStatsHourly, LinkStatsDaily } from '../../models/LinkStats.js';
import { recordClicks } from './mongoAnalyticsWriter.js';
import { getLinkAnalytics, getSummary, exportEvents } from './mongoAnalyticsReader.js';
import { ensureAnalyticsCollections } from './analyticsCollections.js';

/**
 * Deletes a link's (or a whole user's) analytics: raw events and both
 * rollups. Daily rollups are kept indefinitely otherwise, so link and
 * account deletion must remove them explicitly.
 * @param {{ linkId?: string, userId?: string }} scope
 */
async function deleteAnalytics({ linkId, userId }) {
  const [field, id] = linkId ? ['linkId', linkId] : ['userId', userId];
  const objectId = new mongoose.Types.ObjectId(String(id));
  await Promise.all([
    ClickEvent.collection.deleteMany({ [`meta.${field}`]: objectId }),
    LinkStatsHourly.collection.deleteMany({ [field]: objectId }),
    LinkStatsDaily.collection.deleteMany({ [field]: objectId }),
  ]);
}

/** @type {import('./analyticsRepository.js').AnalyticsRepository} */
export const mongoAnalyticsRepository = {
  ensureReady: ensureAnalyticsCollections,
  recordClicks,
  getLinkAnalytics,
  getSummary,
  exportEvents,
  deleteAnalytics,
};
