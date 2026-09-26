import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * The deployed SPA's index.html, fetched from FRONTEND_URL so server-rendered
 * pages (GET /b/:slug) serve the exact current build: same hashed asset
 * URLs, same shell. Kept briefly, since a new frontend deploy changes the
 * asset hashes and the old ones stop being served.
 */
const SHELL_TTL_MS = 60_000;
const SHELL_FETCH_TIMEOUT_MS = 3_000;

let cachedShell = null; // { html, fetchedAt }
let inFlight = null;

async function fetchShell() {
  const res = await fetch(new URL('/index.html', env.FRONTEND_URL), {
    signal: AbortSignal.timeout(SHELL_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SPA shell request failed with status ${res.status}`);
  const html = await res.text();
  if (!html.includes('</head>')) throw new Error('SPA shell has no </head>');
  cachedShell = { html, fetchedAt: Date.now() };
  return html;
}

/**
 * @returns {Promise<string | null>} the shell, a stale copy if the frontend
 *   can't be reached, or null if it has never been fetched successfully
 */
export async function getSpaShell() {
  if (cachedShell && Date.now() - cachedShell.fetchedAt < SHELL_TTL_MS) return cachedShell.html;

  inFlight ??= fetchShell().finally(() => {
    inFlight = null;
  });
  try {
    return await inFlight;
  } catch (err) {
    logger.warn({ err, hasStaleCopy: Boolean(cachedShell) }, 'Could not fetch the SPA shell');
    return cachedShell?.html ?? null;
  }
}

/** Test hook: forget the cached shell. */
export function resetSpaShellCache() {
  cachedShell = null;
  inFlight = null;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Swaps the shell's <title> and description for `title` / `description`,
 * and adds `headTags` (already-escaped HTML) before </head>. Replacements
 * go through functions so `$&`-style sequences in page content stay literal.
 * @param {string} shell
 * @param {{ title: string, description: string, headTags: string }} head
 */
export function injectHead(shell, { title, description, headTags }) {
  const titleTag = `<title>${escapeHtml(title)}</title>`;
  const descriptionTag = `<meta name="description" content="${escapeHtml(description)}" />`;

  let html = shell.replace(/<title>[\s\S]*?<\/title>/i, () => titleTag);
  if (!html.includes(titleTag)) html = html.replace('</head>', () => `${titleTag}\n</head>`);
  html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, () => descriptionTag);
  if (!html.includes(descriptionTag)) html = html.replace('</head>', () => `${descriptionTag}\n</head>`);
  return html.replace('</head>', () => `${headTags}\n  </head>`);
}
