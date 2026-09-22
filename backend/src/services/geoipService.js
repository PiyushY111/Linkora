import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import cron from 'node-cron';
import { Reader } from '@maxmind/geoip2-node';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const execFileAsync = promisify(execFile);

const MAXMIND_DOWNLOAD_URL = (editionId) =>
  `https://download.maxmind.com/geoip/databases/${editionId}/download?suffix=tar.gz`;

let reader = null;
let readerPromise = null;

/**
 * Lazily opens the local MaxMind GeoLite2-City .mmdb file with
 * watchForUpdates enabled, so a file swap by the weekly updater below is
 * picked up in-process without restarting the server.
 */
async function getReader() {
  if (!env.GEOIP_DB_PATH) return null;
  if (reader) return reader;
  if (readerPromise) return readerPromise;

  if (!fs.existsSync(env.GEOIP_DB_PATH)) {
    logger.warn({ path: env.GEOIP_DB_PATH }, 'GeoIP database not found; geo enrichment disabled');
    return null;
  }

  readerPromise = Reader.open(env.GEOIP_DB_PATH, { watchForUpdates: true })
    .then((r) => {
      reader = r;
      logger.info({ path: env.GEOIP_DB_PATH }, 'GeoIP database loaded');
      return reader;
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to load GeoIP database');
      readerPromise = null;
      return null;
    });

  return readerPromise;
}

/**
 * @typedef {Object} GeoLookupResult
 * @property {string} countryCode
 * @property {string} city
 * @property {number} latitude
 * @property {number} longitude
 */

import geoip from 'geoip-lite';

const EMPTY_RESULT = { countryCode: '', city: '', latitude: 0, longitude: 0 };

/**
 * Resolves real geo data for an IP address dynamically using either
 * local MaxMind reader (if configured) or offline geoip-lite dataset.
 * Never throws — returns an empty result for private/reserved ranges.
 * @param {string} ip
 * @returns {Promise<GeoLookupResult>}
 */
export async function lookupGeo(ip) {
  if (!ip) return EMPTY_RESULT;

  // Ignore private / loopback IPs
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return EMPTY_RESULT;
  }

  const r = await getReader();
  if (r) {
    try {
      const response = r.city(ip);
      return {
        countryCode: response.country?.isoCode || '',
        city: response.city?.names?.en || '',
        latitude: response.location?.latitude ?? 0,
        longitude: response.location?.longitude ?? 0,
      };
    } catch {
      // fallback to geoip-lite below
    }
  }

  try {
    const geo = geoip.lookup(ip);
    if (geo) {
      return {
        countryCode: geo.country || '',
        city: geo.city || '',
        latitude: geo.ll?.[0] ?? 0,
        longitude: geo.ll?.[1] ?? 0,
      };
    }
  } catch (err) {
    logger.debug({ err, ip }, 'geoip lookup failed');
  }

  return EMPTY_RESULT;
}

/**
 * Downloads and atomically swaps in a fresh GeoLite2 database using
 * MaxMind's GeoIP Update HTTP API. Requires GEOIP_ACCOUNT_ID and
 * GEOIP_LICENSE_KEY; no-ops (with a log line) when they aren't configured.
 */
export async function updateGeoIpDatabase() {
  if (!env.GEOIP_ACCOUNT_ID || !env.GEOIP_LICENSE_KEY || !env.GEOIP_DB_PATH) {
    logger.info('GeoIP auto-update skipped: GEOIP_ACCOUNT_ID/GEOIP_LICENSE_KEY/GEOIP_DB_PATH not configured');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geoip-update-'));
  const archivePath = path.join(tmpDir, 'geolite2.tar.gz');

  try {
    const auth = Buffer.from(`${env.GEOIP_ACCOUNT_ID}:${env.GEOIP_LICENSE_KEY}`).toString('base64');
    const response = await fetch(MAXMIND_DOWNLOAD_URL(env.GEOIP_EDITION_ID), {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!response.ok) {
      throw new Error(`MaxMind download failed with status ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(archivePath, buffer);

    await execFileAsync('tar', ['-xzf', archivePath, '-C', tmpDir]);

    const extractedDir = fs
      .readdirSync(tmpDir, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.startsWith(env.GEOIP_EDITION_ID));

    if (!extractedDir) {
      throw new Error('Could not locate extracted GeoLite2 directory in archive');
    }

    const extractedMmdb = path.join(tmpDir, extractedDir.name, `${env.GEOIP_EDITION_ID}.mmdb`);
    const targetPath = env.GEOIP_DB_PATH;
    const stagedPath = `${targetPath}.tmp`;

    fs.copyFileSync(extractedMmdb, stagedPath);
    fs.renameSync(stagedPath, targetPath); // atomic on the same filesystem

    logger.info({ path: targetPath }, 'GeoIP database updated');
  } catch (err) {
    logger.error({ err }, 'GeoIP database update failed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Schedules the weekly GeoIP database refresh. No-ops when update
 * credentials aren't configured.
 */
export function scheduleGeoIpUpdates() {
  if (!env.GEOIP_ACCOUNT_ID || !env.GEOIP_LICENSE_KEY || !env.GEOIP_DB_PATH) return;

  // Every Sunday at 03:00.
  cron.schedule('0 3 * * 0', () => {
    updateGeoIpDatabase().catch((err) => logger.error({ err }, 'Scheduled GeoIP update failed'));
  });
}

export default { lookupGeo, updateGeoIpDatabase, scheduleGeoIpUpdates };
