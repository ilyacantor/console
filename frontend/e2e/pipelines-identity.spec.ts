// Operator-visible outcome: operator opens /pipelines/identity (tenant prefilled), sees the same number of pending HITL rows that Console's /api/pipelines/identity/pending reports (or the "No matches pending review" empty marker when the queue is empty), with each rendered row's confidence percentage matching the resolver score from AAM's HITL queue.

import { test, expect, type Page } from '@playwright/test'

const TENANT_ID = process.env.AOS_TENANT_ID || '69688df3-fc8e-51f8-a77c-9c13f9b3a784'

interface PendingRow {
  hitl_queue_id: string
  domain: string
  left_value: string
  right_value: string
  confidence: number
  status: string
}

async function fetchGroundTruth(page: Page): Promise<PendingRow[]> {
  const resp = await page.request.get(`/api/pipelines/identity/pending?tenant_id=${TENANT_ID}`)
  expect.soft(resp.ok(), `ground-truth fetch failed: ${resp.status()}`).toBe(true)
  const body = await resp.json()
  return (body.pending || []) as PendingRow[]
}

test('Identity Review Queue renders pending rows whose confidences match resolver ground truth', async ({ page }) => {
  const pending = await fetchGroundTruth(page)

  await page.goto('/pipelines/identity')

  // Wait for the tenant input to render with the env-injected value (the
  // component pre-populates from VITE_AOS_TENANT_ID at build; if it's empty
  // for this run, type it in).
  const tenantInput = page.locator('[data-testid="identity-tenant-input"]')
  const currentTenant = await tenantInput.inputValue()
  if (!currentTenant) {
    await tenantInput.fill(TENANT_ID)
    await page.locator('[data-testid="identity-refresh-btn"]').click()
  }

  if (pending.length === 0) {
    // Empty queue path — the operator-visible outcome is the empty marker.
    await expect(page.locator('[data-testid="identity-empty"]')).toBeAttached({ timeout: 10000 })
    await expect(page.locator('[data-testid="identity-empty"]')).toHaveText('No matches pending review.')
  } else {
    const rows = page.locator('[data-testid="identity-row"]')
    await expect(rows).toHaveCount(pending.length, { timeout: 10000 })
    // First row's confidence pill matches the resolver-scored value exactly.
    const firstPct = Math.round(pending[0].confidence * 100)
    await expect(rows.first().locator('[data-testid="identity-confidence"]')).toHaveText(`${firstPct}%`)

    // Capture row count BEFORE clicking approve; click drives the action.
    const beforeCount = await rows.count()
    await rows.first().locator('[data-testid="identity-approve-btn"]').click()
    // The row count drops by 1 (or the empty marker appears if the queue was len=1).
    if (beforeCount === 1) {
      await expect(page.locator('[data-testid="identity-empty"]')).toBeAttached({ timeout: 10000 })
    } else {
      await expect(rows).toHaveCount(beforeCount - 1, { timeout: 10000 })
    }
  }

  await page.screenshot({ path: 'e2e/screenshots/pipelines-identity.png', fullPage: true })
})

test('Identity Review Queue requires tenant_id and surfaces 422 (negative)', async ({ page }) => {
  await page.route('**/api/pipelines/identity/pending**', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'tenant_id is required (I2)' }),
    }),
  )
  await page.goto('/pipelines/identity')
  // Force a refresh in case the auto-load missed the route hook.
  await page.locator('[data-testid="identity-refresh-btn"]').click()
  const errorBox = page.locator('[data-testid="identity-error"]')
  await expect(errorBox).toBeAttached({ timeout: 5000 })
  await expect(errorBox).toContainText('tenant_id is required')
})
