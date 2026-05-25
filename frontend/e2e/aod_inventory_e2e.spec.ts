// Operator-visible outcome: operator navigates to /aod/inventory with the tour active and sees 47 rows in the AOD table (one per Crestline app), with the summary cards reading "47" total apps, "6" systems of record, and "9" shadow/unmanaged, and the Salesforce row carrying the SOR badge while Notion's row carries a "shadow" governance pill.

import { test, expect } from '@playwright/test'
import { ALL_APPS } from '../src/demo/seed'

const SOR_COUNT = ALL_APPS.filter((a) => a.is_sor).length
const SHADOW_COUNT = ALL_APPS.filter((a) => a.governance === 'shadow' || a.governance === 'unmanaged').length

test('AOD inventory — table renders one row per seeded Crestline app with governance + SOR', async ({ page }) => {
  await page.goto('/aod/inventory?tour=deploy&stage=aod-scan')

  const table = page.locator('[data-testid="aod-table"]')
  await expect(table).toHaveAttribute('data-testid', 'aod-table')

  const rows = page.locator('[data-testid="aod-row"]')
  await expect(rows).toHaveCount(ALL_APPS.length)

  // Summary card values match seed-derived ground truth.
  await expect(page.locator('[data-testid="aod-summary"]')).toContainText(String(ALL_APPS.length))
  await expect(page.locator('[data-testid="aod-summary"]')).toContainText(String(SOR_COUNT))
  await expect(page.locator('[data-testid="aod-summary"]')).toContainText(String(SHADOW_COUNT))

  // Salesforce row is tagged SOR.
  const sfdcRow = page.locator('[data-testid="aod-row"][data-app-id="sfdc"]')
  await expect(sfdcRow.locator('[data-testid="sor-badge"]')).toHaveText('SOR')

  // Notion row carries the shadow governance pill (no SOR badge).
  const notiRow = page.locator('[data-testid="aod-row"][data-app-id="noti"]')
  await expect(notiRow).toContainText('shadow')
  await expect(notiRow.locator('[data-testid="sor-badge"]')).toBeHidden()

  await page.screenshot({ path: 'e2e/screenshots/aod-inventory-snapshot.png', fullPage: true })
})

test('AOD inventory — outside the tour the empty state explains there is no live AOD data', async ({ page }) => {
  await page.goto('/aod/inventory')

  await expect(page.locator('[data-testid="aod-empty-state"]')).toContainText('No active AOD discovery run')
  // The seeded table is not rendered outside the tour.
  await expect(page.locator('[data-testid="aod-table"]')).toBeHidden()
})
