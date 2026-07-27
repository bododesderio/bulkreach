import { defineConfig, devices } from '@playwright/test';

/**
 * BulkReach E2E — runs against locally-running servers (frontend :3100 proxying
 * /api → backend :3101). Start both before `npx playwright test`. See
 * CONTEXT.md "Running locally". Browsers: the repo's chromium build.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
