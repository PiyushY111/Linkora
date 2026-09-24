import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a running stack (docker compose, see
// e2e/README.md), not a dev server: they exercise the real API, consumer,
// MongoDB and Redis behind nginx.
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results/artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
