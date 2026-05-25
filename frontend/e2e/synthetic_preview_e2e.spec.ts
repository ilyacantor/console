// Operator-visible outcome: operator navigates to /preview/synthetic with the tour active and sees an iframe whose src matches the configured Farm base URL (VITE_FARM_URL or http://localhost:8003) and whose title is "Farm Synthetic Environment". Console is the host; Farm renders its own UI.

import { test, expect } from '@playwright/test'

const FARM_BASE = process.env.VITE_FARM_URL || 'http://localhost:8003'

test('Synthetic preview — Console iframes the real Farm surface', async ({ page }) => {
  await page.goto('/preview/synthetic?tour=deploy&stage=synthetic-env')

  const iframe = page.locator('iframe[title="Farm Synthetic Environment"]')
  const src = await iframe.getAttribute('src')
  expect(src).toBe(FARM_BASE)

  await page.screenshot({ path: 'e2e/screenshots/synthetic-preview.png', fullPage: true })
})
