// Operator-visible outcome: operator opens /pipelines/mappings and sees one mid-confidence row (NetSuite AP invoice "amount" → invoice.gross_billed_usd) rendered with a yellow 78% pill and a "Confirm mapping" button; after the operator clicks the button, the same row's pill flips to a green 99% pill and the status cell reads "Auto-applied".

import { test, expect, type Page } from '@playwright/test'

interface MappingField {
  source_field: string
  concept: string
  property: string
  confidence: number
  tier: 'auto' | 'review' | 'low'
  needs_click: boolean
}

interface MappingPack {
  pack_key: string
  display_name: string
  fields: MappingField[]
}

async function findMidConfidence(page: Page): Promise<{
  pack: MappingPack
  field: MappingField
  confidencePct: number
}> {
  // Ground truth: walk AAM's mapping packs and find a field whose current
  // resolver-tier is "review" with needs_click=true. This is the canonical
  // operator-facing state — `auto` already-approved rows show needs_click=false.
  // Approvals live in AAM's in-process cache; revoking an approval drops the
  // cached override and restores the underlying registry confidence (e.g.
  // invoice "amount" falls back to 0.78). The spec cleans up after itself
  // so it is B14-deterministic across repeated runs.
  const resp = await page.request.get('/api/pipelines/mappings')
  expect.soft(resp.ok(), `ground-truth fetch failed: ${resp.status()}`).toBe(true)
  const body = await resp.json()
  for (const pack of body.packs as MappingPack[]) {
    for (const field of pack.fields) {
      if (field.tier === 'review' && field.needs_click) {
        return { pack, field, confidencePct: Math.round(field.confidence * 100) }
      }
    }
  }
  throw new Error(
    'No mid-confidence (tier=review) row in AAM mapping registry. Inspect ' +
    '/api/aam/mappings to confirm the registry has at least one confidence < 0.90 row.',
  )
}

test('Semantic Mapping shows mid-confidence row at the expected pct; clicking Confirm promotes to 99%', async ({ page }) => {
  const target = await findMidConfidence(page)

  await page.goto('/pipelines/mappings')

  // The row matching the mid-confidence source_field must be attached. Scope
  // the lookup by pack_key since some source_field names (e.g. "amount") appear
  // in multiple packs.
  const pack = page.locator(`[data-testid="mappings-pack"][data-pack-key="${target.pack.pack_key}"]`)
  await expect(pack).toBeAttached({ timeout: 10000 })
  const row = pack.locator(`[data-testid="mappings-field-${target.field.source_field}"]`)
  await expect(row).toBeAttached({ timeout: 10000 })

  const pill = row.locator('[data-testid="mappings-confidence-pill"]')
  // Ground truth = current resolver score for this field.
  await expect(pill).toHaveText(`${target.confidencePct}%`)

  // Operator clicks the approve button — the click MUST drive the action.
  await row.locator('[data-testid="mappings-approve-btn"]').click()

  // After approval the pill renders 99% and the row status is Auto-applied.
  await expect(pill).toHaveText('99%', { timeout: 10000 })
  await expect(row.locator('[data-testid="mappings-status"]')).toHaveText('Auto-applied')

  await page.screenshot({ path: 'e2e/screenshots/pipelines-mappings.png', fullPage: true })

  // B14 cleanup: the operator un-confirms via the same UI surface so the
  // next run finds the same review-tier ground truth. UI-driven click —
  // no test-runner mutations.
  await row.locator('[data-testid="mappings-revoke-btn"]').click()
  await expect(pill).toHaveText(`${target.confidencePct}%`, { timeout: 10000 })
})

test('Semantic Mapping surfaces an upstream failure with the AAM endpoint cited (negative)', async ({ page }) => {
  await page.route('**/api/pipelines/mappings', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: 'AAM unreachable at http://localhost:8002/api/aam/mappings — connection refused: simulated',
      }),
    }),
  )
  await page.goto('/pipelines/mappings')
  const errorBox = page.locator('[data-testid="mappings-error"]')
  await expect(errorBox).toBeAttached({ timeout: 5000 })
  await expect(errorBox).toContainText('AAM unreachable at')
})
