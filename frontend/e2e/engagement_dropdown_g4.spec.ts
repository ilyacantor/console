/**
 * G4 — Engagement dropdown verification.
 * Asserts the real Convergence engagement appears in the ME dropdown
 * with the correct engagement_id value and display name.
 *
 * Ground truth is fetched from /api/engagements at test runtime (B10),
 * not hardcoded — so reseeds don't require editing tests.
 */
import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

interface ConvergenceEngagement {
  engagement_id: string
  engagement_short_name: string | null
  acquirer_entity_id: string
  target_entity_id: string
}

test.describe('G4 — ME engagement dropdown populated with real engagement', () => {
  test('dropdown contains Convergence engagement with correct ID and name', async ({ page, request }) => {
    // Fetch ground truth from Console backend proxy (which calls Convergence).
    // If this fails the test fails loudly — no hardcoded fallback.
    const resp = await request.get('/api/engagements')
    expect(resp.ok(), `GET /api/engagements must succeed; got ${resp.status()}`).toBeTruthy()
    const body = await resp.json() as { engagements: ConvergenceEngagement[] }
    expect(Array.isArray(body.engagements), 'API response must include engagements array').toBeTruthy()
    expect(body.engagements.length, 'Convergence must have at least one engagement seeded').toBeGreaterThan(0)

    const groundTruth = body.engagements[0]!
    const expectedId = groundTruth.engagement_id
    const expectedName = groundTruth.engagement_short_name
      || `${groundTruth.acquirer_entity_id} + ${groundTruth.target_entity_id}`

    await page.goto('/pipeline')
    const m = main(page)

    // Switch to ME
    await m.getByRole('button', { name: 'ME', exact: true }).click()

    // Engagement dropdown must appear
    const dropdown = m.locator('[data-testid="me-engagement-dropdown"]')
    await expect(dropdown).toBeVisible({ timeout: 5_000 })

    // Wait for a non-placeholder option to exist (real engagement loaded).
    // Fails loudly if dropdown gets stuck on "Loading..." or falls into
    // an error row — no silent pass on placeholder rows.
    const realOptions = dropdown.locator('option[value]:not([value=""])')
    await expect(realOptions.first()).toBeAttached({ timeout: 10_000 })

    // Error and empty rows must not be present
    await expect(dropdown.locator('[data-testid="me-engagement-error"]')).toHaveCount(0)
    await expect(dropdown.locator('[data-testid="me-engagement-empty"]')).toHaveCount(0)

    // Read all option elements
    const options = dropdown.locator('option')
    const count = await options.count()
    const optionValues: string[] = []
    const optionTexts: string[] = []
    for (let i = 0; i < count; i++) {
      const val = await options.nth(i).getAttribute('value')
      const txt = await options.nth(i).textContent()
      optionValues.push(val ?? '')
      optionTexts.push(txt ?? '')
    }
    console.log('Dropdown options:', JSON.stringify({ optionValues, optionTexts }))

    // The ground-truth engagement_id must be among the option values
    expect(optionValues).toContain(expectedId)

    // The option text must match the engagement_short_name
    const realIdx = optionValues.indexOf(expectedId)
    expect(optionTexts[realIdx]).toContain(expectedName)

    // Selected text must be a real engagement, not a placeholder
    const selectedText = (await dropdown.locator('option:checked').textContent()) ?? ''
    expect(selectedText).not.toMatch(/No engagements|Loading|Failed to load/)
    expect(selectedText.trim().length).toBeGreaterThan(0)

    await page.screenshot({ path: 'e2e/screenshots/g4-engagement-dropdown.png' })
  })
})
