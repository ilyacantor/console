// Operator-visible outcome: operator opens /pipelines/catalog at the fabric-discovery stage of the tour and sees the seeded summary cards reading "78" fabric pipes / "4" direct connections / "2" MCP servers, the MCP strip listing Snowflake MCP + MuleSoft MCP, the main catalog table populated with 14 seeded fabric pipes, and the direct-connect side panel below listing 4 Charles River and Crestline Billing direct rows.

import { test, expect } from '@playwright/test'
import { FABRIC_PIPE_COUNT_TOTAL, DIRECT_PIPE_COUNT_TOTAL, MCP_VENDOR_SERVERS, pipesAtStage } from '../src/demo/seed'

test('PipelineCatalog — seeded fabric + direct + MCP render at fabric-discovery stage', async ({ page }) => {
  await page.goto('/pipelines/catalog?tour=deploy&stage=fabric-discovery')

  const seed = pipesAtStage('fabric-discovery')
  const fabricVisible = seed.visible.filter((p) => p.fabric_plane !== 'Direct')
  const directVisible = seed.visible.filter((p) => p.fabric_plane === 'Direct')

  // Summary card values come from FABRIC_PIPE_COUNT_TOTAL etc.
  await expect(page.locator('[data-testid="catalog-seed-summary"]')).toContainText(String(FABRIC_PIPE_COUNT_TOTAL))
  await expect(page.locator('[data-testid="catalog-seed-summary"]')).toContainText(String(DIRECT_PIPE_COUNT_TOTAL))

  // MCP strip lists every seeded MCP server.
  const mcpStrip = page.locator('[data-testid="catalog-mcp-strip"]')
  for (const m of MCP_VENDOR_SERVERS) {
    await expect(mcpStrip).toContainText(m.server_label)
  }

  // Main table renders fabric pipes only; direct-connect panel renders the rest.
  const fabricRows = page.locator('[data-testid="catalog-row"]')
  await expect(fabricRows).toHaveCount(fabricVisible.length)

  const directRows = page.locator('[data-testid="direct-connect-row"]')
  await expect(directRows).toHaveCount(directVisible.length)

  await page.screenshot({ path: 'e2e/screenshots/catalog-tour.png', fullPage: true })
})
