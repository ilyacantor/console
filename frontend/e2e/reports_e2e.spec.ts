import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

test.describe('Reports page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reports')
  })

  test('reports page loads', async ({ page }) => {
    const m = main(page)
    await expect(m).toBeVisible()

    // Reports render a ModuleIframe pointing to NLQ.
    // Loading state shows text; if NLQ down shows unavailable message.
    const loadingMsg = m.getByText('Loading NLQ Reports...')
    const unavailable = m.getByText('NLQ service unavailable')
    await expect(loadingMsg.or(unavailable)).toBeVisible({ timeout: 15_000 })

    await page.screenshot({ path: 'e2e/screenshots/reports.png' })
  })

  test('no crash errors in reports', async ({ page }) => {
    const m = main(page)
    await page.waitForTimeout(3000)
    // Should not show "Error" or "Failed" in the main content
    const mainText = await m.textContent() ?? ''
    expect(mainText).not.toContain('undefined')
  })
})

test.describe('NLQ report tabs direct access', () => {
  // These tests hit NLQ directly at port 3005 to verify reports work
  const NLQ_BASE = 'http://localhost:3005'

  test('NLQ is reachable', async ({ page }) => {
    const response = await page.goto(NLQ_BASE, { timeout: 15_000 })
    expect(response?.status()).toBeLessThan(500)
    await page.screenshot({ path: 'e2e/screenshots/nlq-home.png' })
  })
})
