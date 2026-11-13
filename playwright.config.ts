import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:43179',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
});
