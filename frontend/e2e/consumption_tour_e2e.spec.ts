// Operator-visible outcome: operator opens /consumption at the consumption stage of the tour and sees the plug-in destinations panel rendering one card per seeded destination (8 cards including Tableau/Power BI/Looker/Snowflake-as-source/Claude/etc.), the NLQ iframe loading with src ending in "?view=galaxy", and the canned answer sidecar table listing the seeded top-5 advisors (M. Tanaka first, AUM "$612.4M").

import { test, expect } from '@playwright/test'
import { GALAXY_CANNED_ANSWER, PLUGIN_DESTINATIONS } from '../src/demo/seed'

test('Consumption — plug-in panel + galaxy iframe + canned advisor answer render from seed', async ({ page }) => {
  await page.goto('/consumption?tour=deploy&stage=consumption')

  // One card per seeded destination.
  const cards = page.locator('[data-testid="plugin-card"]')
  await expect(cards).toHaveCount(PLUGIN_DESTINATIONS.length)
  // First card matches the first seed entry.
  const firstSeed = PLUGIN_DESTINATIONS[0]
  await expect(cards.first()).toContainText(firstSeed.display_name)
  await expect(cards.first()).toHaveAttribute('data-plugin-status', firstSeed.status)

  // Galaxy iframe wrapper present; iframe URL points at NLQ ?view=galaxy.
  const iframe = page.locator('[data-testid="galaxy-iframe-wrapper"] iframe')
  const src = await iframe.getAttribute('src')
  expect(src ?? '').toContain('?view=galaxy')

  // Canned advisor table: row count + first row contents match seed.
  const answerRows = page.locator('[data-testid="galaxy-answer-row"]')
  await expect(answerRows).toHaveCount(GALAXY_CANNED_ANSWER.rows.length)
  const firstRow = GALAXY_CANNED_ANSWER.rows[0]
  await expect(answerRows.first()).toContainText(firstRow.advisor)
  await expect(answerRows.first()).toContainText(firstRow.aum_q3)

  // Lineage panel cites Charles River and Snowflake.
  await expect(page.locator('[data-testid="galaxy-answer-lineage"]')).toContainText('Charles River IMS')
  await expect(page.locator('[data-testid="galaxy-answer-lineage"]')).toContainText('Snowflake')

  await page.screenshot({ path: 'e2e/screenshots/consumption-tour.png', fullPage: true })
})
