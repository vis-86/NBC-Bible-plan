import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

/**
 * Отдельный контур от vitest (vitest.config.ts include: только 'src/**'), поэтому
 * e2e/ ни при каких обстоятельствах не попадёт в `npm test`.
 *
 * Требует локальный прод-билд + static+bff топологию (см. e2e/offline/README.md):
 * `npm run build` → `npm run bff:start` (фоном) → `npm run static:serve` (фоном) —
 * dev-режим (`next dev`) не регистрирует стабильный SW для офлайн-сценариев.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
