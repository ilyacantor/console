import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

test.describe('Operator Feed — page structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/operator-feed')
  })

  test('heading renders', async ({ page }) => {
    const m = main(page)
    await expect(m.getByRole('heading', { name: 'Operator Feed' })).toBeVisible()
  })

  test('filter controls are present', async ({ page }) => {
    const m = main(page)
    const controls = m.locator('[data-testid="filter-controls"]')
    await expect(controls).toBeVisible()
    await expect(controls.locator('[data-testid="tier-filter"]')).toBeVisible()
    await expect(controls.locator('[data-testid="status-filter"]')).toBeVisible()
  })

  test('auto-refresh indicator is visible', async ({ page }) => {
    const m = main(page)
    await expect(m.locator('[data-testid="auto-refresh-indicator"]')).toBeVisible()
    await expect(m.getByText('Auto-refresh 30s')).toBeVisible()
  })

  test('tier filter has correct options', async ({ page }) => {
    const m = main(page)
    const tierSelect = m.locator('[data-testid="tier-filter"]')
    const options = tierSelect.locator('option')
    await expect(options).toHaveCount(3)
    await expect(options.nth(0)).toHaveText('All')
    await expect(options.nth(1)).toHaveText('Tier 3 Plan')
    await expect(options.nth(2)).toHaveText('Tier 4 Escalate')
  })

  test('status filter has correct options', async ({ page }) => {
    const m = main(page)
    const statusSelect = m.locator('[data-testid="status-filter"]')
    const options = statusSelect.locator('option')
    await expect(options).toHaveCount(7)
    await expect(options.nth(0)).toHaveText('All')
    await expect(options.nth(1)).toHaveText('Pending')
    await expect(options.nth(2)).toHaveText('Approved')
  })
})

test.describe('Operator Feed — sidebar navigation', () => {
  test('Operator Feed nav item exists and navigates correctly', async ({ page }) => {
    await page.goto('/pipeline')
    const sidebar = page.locator('aside').first()
    const navLink = sidebar.getByText('Operator Feed')
    await expect(navLink).toBeVisible()
    await navLink.click()
    await expect(page).toHaveURL(/\/operator-feed/)
    await expect(main(page).getByRole('heading', { name: 'Operator Feed' })).toBeVisible()
  })
})
