import { createLinkRecord } from './linkController.js';
import { validateUrlSafety } from '../middleware/ssrfValidator.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';

const MAX_BULK_SIZE = 1000;
const VALIDATION_CONCURRENCY = 50;

/**
 * Runs an async mapper over items with bounded concurrency, preserving
 * input order in the output array.
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * POST /api/public/v1/links/bulk — accepts up to 1,000 URLs, validates
 * (SSRF + threat check, parallelized) and creates them, returning a
 * per-item result so partial success is visible to the caller.
 */
export const bulkCreateLinks = async (req, res) => {
  const { links } = req.body;

  if (!Array.isArray(links) || links.length === 0) {
    return res.status(400).json({ success: false, message: 'links must be a non-empty array' });
  }
  if (links.length > MAX_BULK_SIZE) {
    return res.status(400).json({ success: false, message: `links cannot exceed ${MAX_BULK_SIZE} entries per batch` });
  }

  const results = await mapWithConcurrency(links, VALIDATION_CONCURRENCY, async (item) => {
    const originalUrl = typeof item === 'string' ? item : item.originalUrl;

    const safety = await validateUrlSafety(originalUrl);
    if (!safety.safe) {
      return { originalUrl, success: false, message: `URL rejected: ${safety.reason}` };
    }

    try {
      const payload = typeof item === 'string' ? { originalUrl } : item;
      const created = await createLinkRecord(req.user.id, payload, { generateQr: false });
      if (!created.success) {
        return { originalUrl, success: false, message: created.message };
      }
      return { originalUrl, success: true, shortCode: created.link.shortCode, shortUrl: created.link.shortUrl };
    } catch (err) {
      return { originalUrl, success: false, message: err.message };
    }
  });

  const succeeded = results.filter((r) => r.success).length;

  logAudit({
    action: 'link.bulk_create',
    actorUserId: req.user.id,
    ipAddress: getClientIp(req),
    diff: { requested: links.length, succeeded },
  });

  res.status(200).json({ success: true, total: links.length, succeeded, failed: links.length - succeeded, results });
};

export default { bulkCreateLinks };
