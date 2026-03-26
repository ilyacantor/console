import { test, expect } from '@playwright/test'

/**
 * QofE (Quality of Earnings) report — end-to-end through NLQ.
 *
 * Verifies that the QofE tab loads data from DCL without timing out.
 * The QofE page lives in NLQ's report portal (port 3005).
 * Requires DCL Postgres to be available — skips otherwise.
 */

const NLQ_BASE = 'http://localhost:3005'
const DCL_HEALTH = 'http://localhost:8004/api/health'

async function isDclPostgresAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    const res = await fetch(DCL_HEALTH, { signal: controller.signal })
    clearTimeout(timeout)
    const body = await res.json()
    return body?.postgres_available === true
  } catch {
    return false
  }
}

test.describe('QofE report loads without timeout', () => {
  test('QofE tab renders EBITDA bridge and summary data', async ({ page }) => {
    const pgAvailable = await isDclPostgresAvailable()
    test.skip(!pgAvailable, 'DCL Postgres unavailable — QofE data not loaded')

    await page.goto(NLQ_BASE)
    await page.waitForTimeout(2000)

    // Navigate to Reports view
    await page.locator('#nav-tab-reports').click()
    await page.waitForTimeout(1000)

    // Click the QofE tab in the report portal tab bar
    const qoeTab = page.getByRole('button', { name: 'QofE' })
    await expect(qoeTab).toBeVisible({ timeout: 10_000 })
    await qoeTab.click()

    // Wait for QofE content to load (this is the critical path — was timing out at 30s)
    // "ADJUSTED EBITDA" header appears once data loads successfully
    await expect(page.getByText('ADJUSTED EBITDA')).toBeVisible({ timeout: 45_000 })

    // Verify bridge adjustment table rendered (8 EBITDA adjustments)
    await expect(page.getByText('Facility Consolidation')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('ADJUSTMENT')).toBeVisible()

    // Verify no error state visible
    await expect(page.getByText(/Error loading report data/i)).not.toBeVisible()
    await expect(page.getByText(/timed out/i)).not.toBeVisible()
  })
})
