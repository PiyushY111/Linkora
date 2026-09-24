import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { registerUser, signIn } from './session';

// AXE_MODE=report records violations to e2e-results/axe/ without failing
// (used for the before/after baseline); the default, strict, fails on any
// violation.
const REPORT_ONLY = process.env.AXE_MODE === 'report';
const OUT_DIR = path.join(process.cwd(), 'e2e-results', 'axe', process.env.AXE_LABEL || 'latest');

const PUBLIC_PAGES = [
  ['landing', '/'],
  ['login', '/login'],
  ['register', '/register'],
];
const APP_PAGES = [
  ['dashboard', '/dashboard'],
  ['analytics', '/analytics/all'],
  ['settings', '/settings'],
  ['developer', '/developer'],
  ['webhooks', '/webhooks'],
];

async function audit(page, name) {
  // Let entry animations settle so axe sees the final colours.
  await page.waitForLoadState('networkidle');
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => {
      // Spinners and pulses loop forever and cannot be finished.
      if (Number.isFinite(a.effect?.getComputedTiming().endTime)) a.finish();
    })
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
  fs.writeFileSync(
    path.join(OUT_DIR, `${name}.json`),
    JSON.stringify({ violations: summary, passes: results.passes.length, incomplete: results.incomplete.map((i) => i.id) }, null, 2)
  );
  if (!REPORT_ONLY) expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

for (const [name, url] of PUBLIC_PAGES) {
  test(`axe: ${name}`, async ({ page }) => {
    await page.goto(url);
    await audit(page, name);
  });
}

test.describe('signed in', () => {
  let session;
  test.beforeAll(async ({ request }) => {
    session = await registerUser(request);
  });

  for (const [name, url] of APP_PAGES) {
    test(`axe: ${name}`, async ({ page }) => {
      await signIn(page, session);
      await page.goto(url);
      await expect(page).toHaveURL(new RegExp(url.replace('/', '\\/')));
      await audit(page, name);
    });
  }
});
