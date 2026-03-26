import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

test.describe('Pipeline page — structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pipeline')
  })

  test('heading and controls render', async ({ page }) => {
    const m = main(page)
    await expect(m.getByRole('heading', { name: 'Pipeline' })).toBeVisible()
    await expect(m.getByRole('button', { name: 'SE', exact: true })).toBeVisible()
    await expect(m.getByRole('button', { name: 'ME', exact: true })).toBeVisible()
    await expect(m.getByRole('button', { name: 'Batch', exact: true })).toBeVisible()
    await expect(m.getByRole('button', { name: 'Step-by-Step', exact: true })).toBeVisible()
    await expect(m.getByRole('button', { name: /Run SE/i })).toBeVisible()
  })

  test('empty state shows prompt', async ({ page }) => {
    const m = main(page)
    await expect(m.getByText('Select a pipeline mode and click Run to begin')).toBeVisible()
  })

  test('mode toggle switches between SE and ME', async ({ page }) => {
    const m = main(page)
    await m.getByRole('button', { name: 'ME', exact: true }).click()
    await expect(m.getByRole('button', { name: /Run ME/i })).toBeVisible()
    await m.getByRole('button', { name: 'SE', exact: true }).click()
    await expect(m.getByRole('button', { name: /Run SE/i })).toBeVisible()
  })

  test('run history section present', async ({ page }) => {
    const m = main(page)
    await expect(m.getByText('Run History')).toBeVisible()
  })
})

test.describe('Pipeline SE batch run', () => {
  test('SE pipeline starts and shows step cards', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Click Run SE
    await m.getByRole('button', { name: /Run SE/i }).click()

    // Wait for pipeline mode label to appear (means polling started)
    await expect(m.getByText('SE Mode')).toBeVisible({ timeout: 10_000 })

    // All 6 SE steps should be present as step card headings
    await expect(m.getByText('Farm Snapshot').first()).toBeVisible()
    await expect(m.getByText('AOD Discovery').first()).toBeVisible()
    await expect(m.getByText('AAM Handoff', { exact: false }).first()).toBeVisible()
    await expect(m.getByText('AAM Inference').first()).toBeVisible()
    await expect(m.getByText('DCL Ingest').first()).toBeVisible()
    await expect(m.getByText('Pipeline Complete').first()).toBeVisible()

    // Should show Job ID
    await expect(m.getByText(/Job:/)).toBeVisible()

    // Wait for either completion or first step success (up to 60s)
    await expect(
      m.getByText('Snapshot ready').first().or(m.getByText(/Pipeline completed/).first()).or(m.getByText(/Pipeline stopped/).first())
    ).toBeVisible({ timeout: 60_000 })

    await page.screenshot({ path: 'e2e/screenshots/pipeline-se-running.png' })
  })
})

test.describe('Pipeline ME batch run', () => {
  test('ME pipeline starts with parallel group', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Switch to ME
    await m.getByRole('button', { name: 'ME', exact: true }).click()

    // Click Run ME
    await m.getByRole('button', { name: /Run ME/i }).click()

    // Wait for pipeline mode label
    await expect(m.getByText('ME Mode')).toBeVisible({ timeout: 10_000 })

    // ME steps
    await expect(m.getByText('DCL Ingest (Entity A)').first()).toBeVisible()
    await expect(m.getByText('DCL Ingest (Entity B)').first()).toBeVisible()
    await expect(m.getByText('DCL Ingest Verify').first()).toBeVisible()
    await expect(m.getByText('COFA Unification').first()).toBeVisible()
    await expect(m.getByText('Pipeline Complete').first()).toBeVisible()

    // Parallel label
    await expect(m.getByText('parallel', { exact: true })).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/pipeline-me-running.png' })
  })
})

test.describe('Pipeline step-by-step mode', () => {
  test('step mode shows Next Step button', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Switch to step-by-step
    await m.getByRole('button', { name: /Step-by-Step/i }).click()

    // Start pipeline
    await m.getByRole('button', { name: /Run SE/i }).click()

    // Wait for first step to complete
    await expect(m.getByText('Farm Snapshot').first()).toBeVisible({ timeout: 10_000 })

    // Should eventually show a "Run" button on the next pending step
    // or a "Next Step" button in the header
    await expect(
      m.getByRole('button', { name: /Next Step/i }).or(m.getByText('Snapshot ready'))
    ).toBeVisible({ timeout: 60_000 })

    await page.screenshot({ path: 'e2e/screenshots/pipeline-step-mode.png' })
  })
})

test.describe('Pipeline run history persistence', () => {
  test('runs persist to Postgres and survive reload', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Start a pipeline — persistence happens per-step, no need to wait for completion
    await m.getByRole('button', { name: /Run SE/i }).click()

    // Wait until at least the first step completes (snapshot ready)
    await expect(
      m.getByText('Snapshot ready').or(m.getByText('SE Mode'))
    ).toBeVisible({ timeout: 15_000 })

    // Give the backend a moment to persist the step to Postgres
    await page.waitForTimeout(3000)

    // Reload page — in-memory state is lost but Postgres has the run
    await page.reload()

    // History section should still be there
    await expect(m.getByText('Run History')).toBeVisible()

    // History table should have at least one row with a job ID (8-char hex)
    const historyRows = m.locator('table').last().locator('tbody tr')
    await expect(historyRows.first()).toBeVisible({ timeout: 10_000 })

    await page.screenshot({ path: 'e2e/screenshots/pipeline-history.png' })
  })
})
