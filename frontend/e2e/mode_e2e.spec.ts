import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

// ── Mode switcher rendering ────────────────────────────────────────

test.describe('Mode switcher', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders 4 mode buttons in dev (SE, MA, ME, ALL)', async ({ page }) => {
    const switcher = page.getByTestId('mode-switcher')
    await expect(switcher.getByRole('button', { name: 'SE', exact: true })).toBeVisible()
    await expect(switcher.getByRole('button', { name: 'MA', exact: true })).toBeVisible()
    await expect(switcher.getByRole('button', { name: 'ME', exact: true })).toBeVisible()
    await expect(switcher.getByRole('button', { name: 'ALL', exact: true })).toBeVisible()
  })

  // Note: ALL button is gated by import.meta.env.DEV. In production builds
  // (vite build), DEV is false and ALL is not rendered. This cannot be tested
  // against the dev server — verified by code inspection of ModeContext.tsx
  // and ModeSwitcher.tsx.

  test('default mode on load is ALL in dev', async ({ page }) => {
    const switcher = page.getByTestId('mode-switcher')
    const allBtn = switcher.getByRole('button', { name: 'ALL', exact: true })
    // ALL button should have the active blue background
    await expect(allBtn).toHaveCSS('font-weight', '600')
  })
})

// ── SE mode ────────────────────────────────────────────────────────

test.describe('SE mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('mode-switcher').getByRole('button', { name: 'SE', exact: true }).click()
  })

  test('entity dropdown shows single entities', async ({ page }) => {
    const switcher = page.getByTestId('entity-switcher')
    await expect(switcher).toBeVisible()
    const options = switcher.locator('option')
    await expect(options).toHaveCount(2)
    await expect(options.nth(0)).toHaveText('Meridian')
    await expect(options.nth(1)).toHaveText('Cascadia')
  })

  test('sidebar shows OPERATE, MONITOR, M.AI, SYSTEM sections', async ({ page }) => {
    const sidebar = page.locator('nav')
    await expect(sidebar.getByText('OPERATE')).toBeVisible()
    await expect(sidebar.getByText('MONITOR')).toBeVisible()
    await expect(sidebar.getByText('M.AI')).toBeVisible()
    await expect(sidebar.getByText('SYSTEM')).toBeVisible()
    // M&A section should NOT appear in SE mode
    await expect(sidebar.getByText('M&A')).not.toBeVisible()
  })
})

// ── MA mode ────────────────────────────────────────────────────────

test.describe('MA mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('mode-switcher').getByRole('button', { name: 'MA', exact: true }).click()
  })

  test('entity dropdown shows entity pairs', async ({ page }) => {
    const switcher = page.getByTestId('entity-switcher')
    const options = switcher.locator('option')
    await expect(options).toHaveCount(1)
    await expect(options.nth(0)).toHaveText('Meridian → Cascadia')
  })

  test('sidebar shows M&A, MONITOR, M.AI, SYSTEM sections', async ({ page }) => {
    const sidebar = page.locator('nav')
    await expect(sidebar.getByText('M&A')).toBeVisible()
    await expect(sidebar.getByText('MONITOR')).toBeVisible()
    await expect(sidebar.getByText('M.AI')).toBeVisible()
    await expect(sidebar.getByText('SYSTEM')).toBeVisible()
    // OPERATE section should NOT appear in MA mode
    await expect(sidebar.getByText('OPERATE')).not.toBeVisible()
  })
})

// ── ME mode ────────────────────────────────────────────────────────

test.describe('ME mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('mode-switcher').getByRole('button', { name: 'ME', exact: true }).click()
  })

  test('entity dropdown shows entity groups', async ({ page }) => {
    const switcher = page.getByTestId('entity-switcher')
    const options = switcher.locator('option')
    await expect(options).toHaveCount(1)
    await expect(options.nth(0)).toHaveText('Meridian + Cascadia')
  })

  test('sidebar shows OPERATE, MONITOR, M.AI, SYSTEM sections', async ({ page }) => {
    const sidebar = page.locator('nav')
    await expect(sidebar.getByText('OPERATE')).toBeVisible()
    await expect(sidebar.getByText('MONITOR')).toBeVisible()
    await expect(sidebar.getByText('M.AI')).toBeVisible()
    await expect(sidebar.getByText('SYSTEM')).toBeVisible()
    await expect(sidebar.getByText('M&A')).not.toBeVisible()
  })
})

// ── ALL mode ───────────────────────────────────────────────────────

test.describe('ALL mode', () => {
  test('entity dropdown shows singles + pairs + groups together', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('mode-switcher').getByRole('button', { name: 'ALL', exact: true }).click()
    const switcher = page.getByTestId('entity-switcher')
    const options = switcher.locator('option')
    await expect(options).toHaveCount(4)
    await expect(options.nth(0)).toHaveText('Meridian')
    await expect(options.nth(1)).toHaveText('Cascadia')
    await expect(options.nth(2)).toHaveText('Meridian → Cascadia')
    await expect(options.nth(3)).toHaveText('Meridian + Cascadia')
  })
})

// ── Mode switch resets entity ──────────────────────────────────────

test.describe('Mode switching', () => {
  test('switching mode resets entity selection to first option', async ({ page }) => {
    await page.goto('/')
    // Switch to SE and select Cascadia
    await page.getByTestId('mode-switcher').getByRole('button', { name: 'SE', exact: true }).click()
    await page.getByTestId('entity-switcher').selectOption('cascadia')
    await expect(page.getByTestId('entity-switcher')).toHaveValue('cascadia')

    // Switch to MA — should reset to first MA option
    await page.getByTestId('mode-switcher').getByRole('button', { name: 'MA', exact: true }).click()
    await expect(page.getByTestId('entity-switcher')).toHaveValue('meridian-cascadia')
  })
})

// ── Sidebar navigation ────────────────────────────────────────────

test.describe('Sidebar navigation', () => {
  test('sidebar tab navigates to placeholder view with mode name', async ({ page }) => {
    await page.goto('/')
    // Switch to MA mode
    await page.getByTestId('mode-switcher').getByRole('button', { name: 'MA', exact: true }).click()
    // Click Merge in sidebar
    await page.locator('nav').getByText('Merge').click()
    await expect(page).toHaveURL(/\/merge/)
    await expect(main(page).getByText('Merge — MA')).toBeVisible()
  })

  test('sidebar tab navigates to existing page', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('mode-switcher').getByRole('button', { name: 'SE', exact: true }).click()
    await page.locator('nav').getByText('Pipeline').click()
    await expect(page).toHaveURL(/\/pipeline/)
    await expect(main(page).getByRole('heading', { name: 'Pipeline' })).toBeVisible()
  })
})

// ── Instrumentation indent ─────────────────────────────────────────

test.describe('Instrumentation indent', () => {
  test('Instrumentation is at same indent level as Constitution', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('mode-switcher').getByRole('button', { name: 'SE', exact: true }).click()
    const sidebar = page.locator('nav')
    const constitution = sidebar.getByText('Constitution', { exact: true })
    const instrumentation = sidebar.getByText('Instrumentation', { exact: true })
    await expect(constitution).toBeVisible()
    await expect(instrumentation).toBeVisible()
    // Both should have paddingLeft of 14px (not indented at 28px)
    const constPadding = await constitution.evaluate((el) => getComputedStyle(el).paddingLeft)
    const instrPadding = await instrumentation.evaluate((el) => getComputedStyle(el).paddingLeft)
    expect(constPadding).toBe(instrPadding)
  })
})
