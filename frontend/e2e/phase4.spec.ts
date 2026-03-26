import { test, expect } from '@playwright/test'

// Helper: scope to main content area (excludes sidebar/topbar)
function main(page: import('@playwright/test').Page) {
  return page.getByRole('main')
}

// ── Navigation ──────────────────────────────────────────────────────

test.describe('Sidebar navigation', () => {
  test('all Phase 4 nav links present', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('nav')
    await expect(sidebar.getByText('Upload')).toBeVisible()
    await expect(sidebar.getByText('Config')).toBeVisible()
    await expect(sidebar.getByText('Instrumentation')).toBeVisible()
    await expect(sidebar.getByText('Engagements')).toBeVisible()
    await expect(sidebar.getByText('Narrative')).toBeVisible()
  })

  test('nav sections present', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('nav')
    // Default mode in dev is ALL — shows OPERATE, M&A, MONITOR, M.AI, SYSTEM
    await expect(sidebar.getByText('OPERATE')).toBeVisible()
    await expect(sidebar.getByText('M&A')).toBeVisible()
    await expect(sidebar.getByText('MONITOR')).toBeVisible()
    await expect(sidebar.getByText('M.AI')).toBeVisible()
    await expect(sidebar.getByText('SYSTEM')).toBeVisible()
  })
})

// ── Upload screen ───────────────────────────────────────────────────

test.describe('Upload page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/upload')
  })

  test('heading renders', async ({ page }) => {
    await expect(main(page).getByRole('heading', { name: 'Upload' })).toBeVisible()
  })

  test('acquirer and target panels present', async ({ page }) => {
    // Labels are styled pills inside main content
    await expect(main(page).getByText('Acquirer', { exact: true })).toBeVisible()
    await expect(main(page).getByText('Target', { exact: true })).toBeVisible()
  })

  test('drop zones present with instructions', async ({ page }) => {
    const dropTexts = main(page).getByText('Drop GL and CoA files here')
    await expect(dropTexts).toHaveCount(2)
    const csvHints = main(page).getByText('CSV or Excel')
    await expect(csvHints).toHaveCount(2)
  })

  test('file input elements exist (hidden)', async ({ page }) => {
    const inputs = main(page).locator('input[type="file"]')
    await expect(inputs).toHaveCount(2)
  })

  test('optional enrichment section present', async ({ page }) => {
    await expect(main(page).getByText('Optional enrichment')).toBeVisible()
    await expect(main(page).getByText('Unlocks deliverables 8-10')).toBeVisible()
    await expect(main(page).getByText('Customer data')).toBeVisible()
    await expect(main(page).getByText('Vendor data')).toBeVisible()
    await expect(main(page).getByText('Headcount data')).toBeVisible()
  })

  test('intake pipeline section present', async ({ page }) => {
    await expect(main(page).getByText('Intake pipeline')).toBeVisible()
    await expect(main(page).getByText('Parse GL (acquirer)')).toBeVisible()
    await expect(main(page).getByText('Parse GL (target)')).toBeVisible()
    await expect(main(page).getByText('Validate both GLs')).toBeVisible()
    await expect(main(page).getByText('Convert to triples')).toBeVisible()
    await expect(main(page).getByText('Push to PG')).toBeVisible()
    await expect(main(page).getByText('Trigger COFA chain')).toBeVisible()
  })

  test('proceed button present and disabled initially', async ({ page }) => {
    const btn = main(page).getByRole('button', { name: /proceed to mapping/i })
    await expect(btn).toBeVisible()
    await expect(btn).toBeDisabled()
  })
})

// ── Config screen ───────────────────────────────────────────────────

test.describe('Config page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/config')
  })

  test('heading renders', async ({ page }) => {
    await expect(main(page).getByRole('heading', { name: 'Config' })).toBeVisible()
  })

  test('cron schedules section present', async ({ page }) => {
    await expect(main(page).getByText('Cron schedules')).toBeVisible()
    await expect(main(page).getByText('AOD discovery')).toBeVisible()
    await expect(main(page).getByText('AAM drift')).toBeVisible()
    await expect(main(page).getByText('DCL coverage')).toBeVisible()
    await expect(main(page).getByText('Health check')).toBeVisible()
  })

  test('module URLs section present', async ({ page }) => {
    await expect(main(page).getByText('Module URLs')).toBeVisible()
    // URL fields: 5 text inputs with monospace font for module URLs
    const urlSection = main(page).getByText('Module URLs').locator('..')
    const urlInputs = urlSection.locator('input')
    await expect(urlInputs).toHaveCount(5)
  })

  test('detection thresholds section present', async ({ page }) => {
    await expect(main(page).getByText('Detection thresholds')).toBeVisible()
    await expect(main(page).getByText('Coverage drop alert (%)')).toBeVisible()
    await expect(main(page).getByText('Confidence drop alert')).toBeVisible()
    await expect(main(page).getByText('Freshness stale-after (hours)')).toBeVisible()
  })

  test('entity configuration section present', async ({ page }) => {
    await expect(main(page).getByText('Entity configuration')).toBeVisible()
    await expect(main(page).getByText('Active entities')).toBeVisible()
    await expect(main(page).getByText('Default entity view')).toBeVisible()
    await expect(main(page).getByText('Engagement mode')).toBeVisible()
  })

  test('save buttons present', async ({ page }) => {
    const saveButtons = main(page).getByRole('button', { name: 'Save' })
    await expect(saveButtons).toHaveCount(4)
  })

  test('number inputs for cron intervals exist', async ({ page }) => {
    // 4 cron modules each have a number input for interval
    const cronSection = main(page).getByText('Cron schedules').locator('..')
    const numberInputs = cronSection.locator('input[type="number"]')
    await expect(numberInputs).toHaveCount(4)
  })

  test('entity dropdowns have options', async ({ page }) => {
    const viewSelect = main(page).getByRole('combobox').first()
    await expect(viewSelect).toBeVisible()
    const options = viewSelect.locator('option')
    // At minimum "All" option, plus any entities from engagements
    const count = await options.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

// ── Instrumentation screen ──────────────────────────────────────────

test.describe('Instrumentation page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instrumentation')
  })

  test('heading renders', async ({ page }) => {
    await expect(main(page).getByRole('heading', { name: 'Instrumentation' })).toBeVisible()
  })

  test('4 summary cards present', async ({ page }) => {
    await expect(main(page).getByText('Total runs')).toBeVisible()
    await expect(main(page).getByText('Total tokens')).toBeVisible()
    await expect(main(page).getByText('Total cost')).toBeVisible()
    await expect(main(page).getByText('Avg COFA duration')).toBeVisible()
  })

  test('run ledger table present with headers', async ({ page }) => {
    const table = main(page).locator('table')
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /Step name/ })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /Run tag/ })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /Duration/ })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /Tokens/ })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /Cost/ })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /Status/ })).toBeVisible()
  })

  test('step filter dropdown present', async ({ page }) => {
    await expect(main(page).getByText('Filter:')).toBeVisible()
    const select = main(page).getByRole('combobox')
    await expect(select).toBeVisible()
    await expect(select.locator('option').first()).toHaveText('All steps')
  })

  test('cost trend text present', async ({ page }) => {
    await expect(main(page).getByText(/Last 7 days/)).toBeVisible()
  })
})

// ── Engagements screen ──────────────────────────────────────────────

test.describe('Engagements page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/engagements')
  })

  test('heading renders', async ({ page }) => {
    await expect(main(page).getByRole('heading', { name: 'Engagements' })).toBeVisible()
  })

  test('new engagement button present', async ({ page }) => {
    const btn = main(page).getByRole('button', { name: /new engagement/i })
    await expect(btn).toBeVisible()
  })

  test('new engagement button opens create form with dropdowns', async ({ page }) => {
    await main(page).getByRole('button', { name: /new engagement/i }).click()
    await expect(main(page).getByText('New engagement', { exact: true })).toBeVisible()
    // Acquirer, Target, and Type dropdowns (3 total in the create form)
    const selects = main(page).locator('select')
    await expect(selects).toHaveCount(3)
    await expect(main(page).getByRole('button', { name: 'Create' })).toBeVisible()
    await expect(main(page).getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  test('engagement table headers present', async ({ page }) => {
    const table = main(page).locator('table')
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'ID' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Acquirer' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Target' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Type' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Status' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Last activity' })).toBeVisible()
  })
})

// ── Narrative Editor screen ─────────────────────────────────────────

test.describe('Narrative Editor page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/narrative-editor')
  })

  test('heading renders', async ({ page }) => {
    await expect(main(page).getByRole('heading', { name: 'Narrative Editor' })).toBeVisible()
  })

  test('step count summary present', async ({ page }) => {
    await expect(main(page).getByText(/\d+ steps, \d+ messages/)).toBeVisible()
  })

  test('reset defaults button present', async ({ page }) => {
    await expect(main(page).getByRole('button', { name: 'Reset Defaults' })).toBeVisible()
  })

  test('save button present', async ({ page }) => {
    await expect(main(page).getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  })
})

// ── Cross-screen: route accessibility ───────────────────────────────

test.describe('Route accessibility', () => {
  const routes = [
    { path: '/upload', heading: 'Upload' },
    { path: '/config', heading: 'Config' },
    { path: '/instrumentation', heading: 'Instrumentation' },
    { path: '/engagements', heading: 'Engagements' },
    { path: '/narrative-editor', heading: 'Narrative Editor' },
    { path: '/pipeline', heading: 'Pipeline' },
    { path: '/changes', heading: 'Changes' },
  ]

  for (const { path, heading } of routes) {
    test(`${path} loads and shows heading`, async ({ page }) => {
      await page.goto(path)
      await expect(main(page).getByRole('heading', { name: heading })).toBeVisible()
    })
  }
})

// ── Sidebar navigation clicks ───────────────────────────────────────

test.describe('Sidebar click navigation', () => {
  test('clicking Upload navigates to /upload', async ({ page }) => {
    await page.goto('/')
    await page.locator('nav').getByText('Upload').click()
    await expect(page).toHaveURL(/\/upload/)
    await expect(main(page).getByRole('heading', { name: 'Upload' })).toBeVisible()
  })

  test('clicking Config navigates to /config', async ({ page }) => {
    await page.goto('/')
    await page.locator('nav').getByText('Config').click()
    await expect(page).toHaveURL(/\/config/)
    await expect(main(page).getByRole('heading', { name: 'Config' })).toBeVisible()
  })

  test('clicking Instrumentation navigates to /instrumentation', async ({ page }) => {
    await page.goto('/')
    await page.locator('nav').getByText('Instrumentation').click()
    await expect(page).toHaveURL(/\/instrumentation/)
    await expect(main(page).getByRole('heading', { name: 'Instrumentation' })).toBeVisible()
  })

  test('clicking Engagements navigates to /engagements', async ({ page }) => {
    await page.goto('/')
    await page.locator('nav').getByText('Engagements').click()
    await expect(page).toHaveURL(/\/engagements/)
    await expect(main(page).getByRole('heading', { name: 'Engagements' })).toBeVisible()
  })

  test('clicking Narrative navigates to /narrative-editor', async ({ page }) => {
    await page.goto('/')
    await page.locator('nav').getByText('Narrative').click()
    await expect(page).toHaveURL(/\/narrative-editor/)
    await expect(main(page).getByRole('heading', { name: 'Narrative Editor' })).toBeVisible()
  })
})
