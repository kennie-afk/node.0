import { defineConfig } from '@playwright/test';

/**
 * Browser tests against a running stack that has the demo data: `docker compose up -d` with
 * DEMO_LOGINS=true, then `node tools/seed-demo.mjs` in cmsbackend. They use the Chrome already on
 * the machine, so nothing is downloaded. Run: `npm run e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    headless: process.env.E2E_HEADED ? false : true,
    viewport: { width: 1366, height: 850 },
    screenshot: 'only-on-failure'
  }
});
