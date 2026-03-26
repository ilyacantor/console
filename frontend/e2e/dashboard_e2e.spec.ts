import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

test.describe('Dashboard page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboards')
  })

  test('dashboard page loads', async ({ page }) => {
    const m = main(page)
    await expect(m).toBeVisible()

    // Dashboards render a ModuleIframe pointing to NLQ.
    // Loading state shows text; if NLQ down shows unavailable message.
    const loadingMsg = m.getByText('Loading NLQ Dashboards...')
    const unavailable = m.getByText('NLQ service unavailable')
    await expect(loadingMsg.or(unavailable)).toBeVisible({ timeout: 15_000 })

    await page.screenshot({ path: 'e2e/screenshots/dashboard.png' })
  })

  test('no crash errors in dashboard', async ({ page }) => {
    const m = main(page)
    await page.waitForTimeout(3000)
    const mainText = await m.textContent() ?? ''
    expect(mainText).not.toContain('undefined')
  })
})
