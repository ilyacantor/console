import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3009',
    headless: true,
    screenshot: 'only-on-failure',
  },
  outputDir: './e2e/test-results',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
