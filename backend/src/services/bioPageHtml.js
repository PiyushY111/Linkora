import { env } from '../config/env.js';
import { escapeHtml, injectHead } from './spaShell.js';

const SITE_NAME = 'Linkora';

/**
 * CSP for bio pages served through the SPA shell. Mirrors app.js's helmet
 * policy, plus Google Fonts (the shell's stylesheet) and, in development,
 * Vite's inline React-refresh preamble and HMR socket.
 */
export function bioPageCsp() {
  const isDev = env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    `connect-src 'self' https: wss:${isDev ? ' http: ws:' : ''}`,
    "font-src 'self' https: data:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function metaTag(attr, key, value) {
  return `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
}

/** Title, description and link-preview tags for a public bio page. */
function bioPageHead(page) {
  const title = page.title || `@${page.slug}`;
  const description = page.bio || `${title} on ${SITE_NAME}`;
  const url = new URL(`/b/${page.slug}`, env.FRONTEND_URL).href;

  const tags = [
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    metaTag('property', 'og:type', 'profile'),
    metaTag('property', 'og:site_name', SITE_NAME),
    metaTag('property', 'og:url', url),
    metaTag('property', 'og:title', title),
    metaTag('property', 'og:description', description),
    metaTag('name', 'twitter:card', 'summary'),
    metaTag('name', 'twitter:title', title),
    metaTag('name', 'twitter:description', description),
  ];
  // Platforms only render raster images, and the frontend has no raster
  // default yet, so a page without an avatar gets a text-only preview.
  if (page.avatarUrl) {
    tags.push(metaTag('property', 'og:image', page.avatarUrl), metaTag('name', 'twitter:image', page.avatarUrl));
  }

  return { title: `${title} | ${SITE_NAME}`, description, headTags: tags.map((tag) => `    ${tag}`).join('\n') };
}

const NOT_FOUND_HEAD = {
  title: `Page not found | ${SITE_NAME}`,
  description: 'This bio page does not exist.',
  headTags: '    <meta name="robots" content="noindex" />',
};

/**
 * Minimal standalone page for when the SPA shell can't be fetched: the same
 * head tags, and the links as plain anchors so a visitor can still use it.
 */
function standalonePage(head, bodyHtml) {
  return injectHead(
    `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  </head>\n  <body>${bodyHtml}</body>\n</html>\n`,
    head
  );
}

function standaloneBioBody(page) {
  const { bgColor, primaryColor } = page.theme;
  const links = page.items
    .map(
      (item) =>
        `<li><a href="${escapeHtml(item.shortUrl)}" style="color:${escapeHtml(primaryColor)}">${escapeHtml(item.label)}</a></li>`
    )
    .join('');
  return `<main style="max-width:32rem;margin:3rem auto;padding:0 1rem;font-family:system-ui,sans-serif;background:${escapeHtml(bgColor)}">
<h1>${escapeHtml(page.title || `@${page.slug}`)}</h1>${page.bio ? `<p>${escapeHtml(page.bio)}</p>` : ''}<ul>${links}</ul></main>`;
}

/**
 * @param {string | null} shell - the SPA's index.html, or null if unavailable
 * @param {object | null} page - public bio page data, or null for a 404
 * @returns {string}
 */
export function renderBioPageHtml(shell, page) {
  const head = page ? bioPageHead(page) : NOT_FOUND_HEAD;
  if (shell) return injectHead(shell, head);
  return standalonePage(head, page ? standaloneBioBody(page) : '<main><h1>Page not found</h1></main>');
}
