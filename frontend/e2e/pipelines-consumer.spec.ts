// Operator-visible outcome: operator opens /pipelines/consumer, fills tenant + domain ("invoice"), clicks "Run query", sees a results table with N rows (where N matches Console's /api/pipelines/consumer/query count and N >= 1 against the seeded DCL data); operator clicks the first row's "Drill" button, sees a provenance panel listing source_system="netsuite" with source_field="amount" for the invoice.gross_billed_usd triple.

import { test, expect, type Page } from '@playwright/test'

const TENANT_ID = process.env.AOS_TENANT_ID || '69688df3-fc8e-51f8-a77c-9c13f9b3a784'
const TEST_DOMAIN = 'invoice'

interface Triple {
  triple_id?: string
  id?: string
  concept?: string
  entity_id?: string
  source_system?: string
  source_field?: string
  confidence_score?: number
}

async function fetchGroundTruth(page: Page): Promise<{ count: number; first: Triple }> {
  // GET-form of the consumer query — query_triples is a read-only MCP tool,
  // so the GET surface is the ground-truth read path (allowed by Playwright
  // Acceptance rules; mutative POSTs from the runner are banned).
  const params = new URLSearchParams({ tenant_id: TENANT_ID, domain: TEST_DOMAIN, limit: '25' })
  const resp = await page.request.get(`/api/pipelines/consumer/query?${params.toString()}`)
  expect.soft(resp.ok(), `ground-truth fetch failed: ${resp.status()}`).toBe(true)
  const body = await resp.json()
  const triples = (body.triples || []) as Triple[]
  return { count: body.count || triples.length, first: triples[0] }
}

test('Consumer drill-through renders MCP query results and drills into provenance', async ({ page }) => {
  const gt = await fetchGroundTruth(page)
  expect(gt.count).toBeGreaterThanOrEqual(1)
  expect(gt.first.source_system).toBeDefined()
  expect(gt.first.source_field).toBeDefined()

  await page.goto('/pipelines/consumer')

  // Make sure tenant input has the test value.
  const tenantInput = page.locator('[data-testid="consumer-tenant-input"]')
  const currentTenant = await tenantInput.inputValue()
  if (currentTenant !== TENANT_ID) {
    await tenantInput.fill(TENANT_ID)
  }

  // Operator types domain and clicks Run query — click drives the action.
  await page.locator('[data-testid="consumer-domain-input"]').fill(TEST_DOMAIN)
  await page.locator('[data-testid="consumer-query-btn"]').click()

  // Results table renders with the same number of rows that MCP returned.
  await expect(page.locator('[data-testid="consumer-results-table"]')).toBeAttached({ timeout: 15000 })
  const rows = page.locator('[data-testid="consumer-row"]')
  await expect(rows).toHaveCount(gt.count, { timeout: 15000 })

  // Operator drills the first row — click triggers provenance MCP call.
  await rows.first().locator('[data-testid="consumer-drill-btn"]').click()

  // Drill panel appears with source rows.
  await expect(page.locator('[data-testid="consumer-drill-panel"]')).toBeAttached({ timeout: 15000 })
  const drillRows = page.locator('[data-testid="consumer-drill-row"]')
  await expect(drillRows.first()).toBeAttached({ timeout: 15000 })

  // Source system + source field match the triple from ground truth.
  const expectedSystem = String(gt.first.source_system)
  const expectedField = String(gt.first.source_field)
  await expect(drillRows.first().locator('[data-testid="consumer-drill-source-system"]')).toHaveText(expectedSystem)
  await expect(drillRows.first().locator('[data-testid="consumer-drill-source-field"]')).toHaveText(expectedField)

  await page.screenshot({ path: 'e2e/screenshots/pipelines-consumer.png', fullPage: true })
})

test('Consumer query refuses missing tenant with an identity-required error (negative)', async ({ page }) => {
  await page.goto('/pipelines/consumer')
  // Operator clears the tenant and tries to query.
  await page.locator('[data-testid="consumer-tenant-input"]').fill('')
  await page.locator('[data-testid="consumer-domain-input"]').fill(TEST_DOMAIN)
  await page.locator('[data-testid="consumer-query-btn"]').click()
  const errorBox = page.locator('[data-testid="consumer-error"]')
  await expect(errorBox).toBeAttached({ timeout: 5000 })
  await expect(errorBox).toContainText('tenant_id is required')
})
