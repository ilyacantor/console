/**
 * G4 — Engagement dropdown verification.
 * Asserts the real Convergence engagement appears in the ME dropdown
 * with the correct engagement_id value and display name.
 */
import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

const REAL_ENGAGEMENT_ID = '3c299509-3219-47ae-a751-9b554f60510a'

test.describe('G4 — ME engagement dropdown populated with real engagement', () => {
  test('dropdown contains Convergence engagement with correct ID and name', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Switch to ME
    await m.getByRole('button', { name: 'ME', exact: true }).click()

    // Engagement dropdown must appear
    const dropdown = m.locator('[data-testid="me-engagement-dropdown"]')
    await expect(dropdown).toBeVisible({ timeout: 5_000 })

    // Wait for loading to complete — "No engagements found" or real options
    await page.waitForTimeout(2000)

    // Read all option elements
    const options = dropdown.locator('option')
    const count = await options.count()

    // Must have at least 2 options (placeholder + real engagement)
    // or 1 option that is the real engagement (no placeholder)
    const optionValues: string[] = []
    const optionTexts: string[] = []
    for (let i = 0; i < count; i++) {
      const val = await options.nth(i).getAttribute('value')
      const txt = await options.nth(i).textContent()
      optionValues.push(val ?? '')
      optionTexts.push(txt ?? '')
    }

    console.log('Dropdown options:', JSON.stringify({ optionValues, optionTexts }))

    // The real engagement_id must be among the option values
    expect(optionValues).toContain(REAL_ENGAGEMENT_ID)

    // The option for the real engagement must display "MerCas" (engagement_short_name)
    const realIdx = optionValues.indexOf(REAL_ENGAGEMENT_ID)
    expect(optionTexts[realIdx]).toContain('MerCas')

    // "No engagements found" must NOT be the selected text
    const selectedText = await dropdown.locator('option:checked').textContent()
    expect(selectedText).not.toContain('No engagements found')
    expect(selectedText).not.toContain('Loading')

    await page.screenshot({ path: 'e2e/screenshots/g4-engagement-dropdown.png' })
  })
})
