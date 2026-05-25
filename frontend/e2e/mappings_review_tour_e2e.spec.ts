// Operator-visible outcome: operator opens /mappings/review at the two-panel-mapping stage of the tour and sees the TransportFlow left panel listing 12 seeded pipes with modality chips, the proposals table on the right showing the 16 seeded mappings with Salesforce Account.Name proposed → Client.display_name at confidence 0.98, and clicking a Kafka pipe (data-modality="Kafka") in the left panel highlights it as selected.

import { test, expect } from '@playwright/test'
import { mappingsAtStage } from '../src/demo/seed'

test('MappingsReview — TransportFlow + proposals + selection render from seed at mapping stage', async ({ page }) => {
  await page.goto('/mappings/review?tour=deploy&stage=two-panel-mapping')

  const expected = mappingsAtStage('two-panel-mapping')

  // Proposals table rows = sample size.
  const proposalRows = page.locator('[data-testid="proposal-row"]')
  await expect(proposalRows).toHaveCount(expected.visible.length)

  // First row contents match the first seeded mapping.
  const firstMapping = expected.visible[0]
  await expect(proposalRows.first()).toContainText(firstMapping.source_field)
  await expect(proposalRows.first()).toContainText(firstMapping.vendor)

  // Confirmed-count summary reads the seeded total (312 at this stage).
  await expect(page.locator('[data-testid="mappings-confirmed-count"]')).toContainText(String(expected.confirmed))

  // TransportFlow left panel is present with the Kafka pipe row.
  const transport = page.locator('[data-testid="transport-flow"]')
  await expect(transport).toContainText('Transport')
  const kafkaPipe = page.locator('[data-testid="transport-pipe-row"][data-pipe-id="kfka-sfdc-events"]')
  await kafkaPipe.click()
  await expect(kafkaPipe).toHaveAttribute('data-selected', 'true')

  await page.screenshot({ path: 'e2e/screenshots/mappings-review-tour.png', fullPage: true })
})

test('MappingsReview — outside the tour, the left TransportFlow panel is not rendered', async ({ page }) => {
  await page.goto('/mappings/review')
  await expect(page.locator('[data-testid="transport-flow"]')).toBeHidden()
})
