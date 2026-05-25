// Operator-visible outcome: operator opens /inspect at the semantic-layer stage of the tour and sees the Coverage tab active by default with one row per seeded domain (7 domains: Client, HR, Finance, IT, Risk, Portfolio, Billing), the Portfolio row reading "142,900" triples, and the per-record provenance ribbon below listing examples that include "Charles River IMS" and "Account.aum".

import { test, expect } from '@playwright/test'
import { coverageAtStage, PROVENANCE_EXAMPLES } from '../src/demo/seed'

test('Inspect — coverage tab + per-record provenance ribbon render from seed at semantic stage', async ({ page }) => {
  await page.goto('/inspect?tour=deploy&stage=semantic-layer')

  const expectedDomains = coverageAtStage('semantic-layer')

  const coverageRows = page.locator('[data-testid="coverage-row"]')
  await expect(coverageRows).toHaveCount(expectedDomains.length)

  // The Portfolio row carries the seeded record count.
  const portfolioRow = page.locator('[data-testid="coverage-row"][data-domain="Portfolio"]')
  await expect(portfolioRow).toContainText('142,900')

  // Provenance ribbon present with the expected example contents.
  const ribbon = page.locator('[data-testid="provenance-ribbon"]')
  await expect(ribbon).toContainText('Per-record provenance')
  for (const ex of PROVENANCE_EXAMPLES) {
    await expect(ribbon).toContainText(ex.example_record)
  }

  await page.screenshot({ path: 'e2e/screenshots/inspect-tour.png', fullPage: true })
})
