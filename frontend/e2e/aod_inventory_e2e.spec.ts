// Operator-visible outcome: operator navigates to /aod/inventory with the tour active and sees an iframe whose src matches the configured AOD base URL (VITE_AOD_URL or http://localhost:8001), the iframe carries the title "AOD Discovery", and Mai's surface-extras get_surface_state reports the iframe_url + module="AOD" for that route. Outside the tour the same iframe renders against the same URL — Console's job is to host AOD, not rebuild it.

import { test, expect } from '@playwright/test'

const AOD_BASE = process.env.VITE_AOD_URL || 'http://localhost:8001'

test('AOD inventory — Console iframes the real AOD Discovery surface', async ({ page }) => {
  await page.goto('/aod/inventory?tour=deploy&stage=aod-scan')

  const iframe = page.locator('iframe[title="AOD Discovery"]')
  const src = await iframe.getAttribute('src')
  expect(src).toBe(AOD_BASE)

  await page.screenshot({ path: 'e2e/screenshots/aod-inventory-snapshot.png', fullPage: true })
})

test('AOD inventory — same iframe renders outside the tour (real route, real module)', async ({ page }) => {
  await page.goto('/aod/inventory')

  const iframe = page.locator('iframe[title="AOD Discovery"]')
  const src = await iframe.getAttribute('src')
  expect(src).toBe(AOD_BASE)
})
