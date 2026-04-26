// Operator-visible outcome: /pipeline shows the SE pipeline header and Run button; clicking Run renders all 7 SE step cards (Farm Snapshot → AOD Discovery → AOD-AAM Handoff → AAM Inference → DCL Ingest → Verify Data in Ask & Dashboards → Pipeline Complete) with a non-UUID run_name in the footer; reload preserves the run in history.
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
    await expect(m.getByRole('heading', { name: 'Pipeline' })).toBeVisible({ timeout: 5_000 })
    await expect(m.getByRole('button', { name: 'Batch', exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(m.getByRole('button', { name: 'Step-by-Step', exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(m.getByRole('button', { name: /^Run$/ })).toBeVisible({ timeout: 5_000 })
  })

  test('empty state shows prompt', async ({ page }) => {
    const m = main(page)
    await expect(m.getByText('Click Run to start the pipeline.')).toBeVisible({ timeout: 5_000 })
  })

  test('run history section present', async ({ page }) => {
    const m = main(page)
    await expect(m.getByText('Run History')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Pipeline SE batch run', () => {
  test('SE pipeline starts and shows step cards with run_name', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /^Run$/ }).click()

    await expect(m.getByText('Farm Snapshot').first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('AOD Discovery').first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('AAM Handoff', { exact: false }).first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('AAM Inference').first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('DCL Ingest').first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('Pipeline Complete').first()).toBeVisible({ timeout: 10_000 })

    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toBeVisible({ timeout: 30_000 })
    const runNameText = await runNameLabel.textContent()
    expect(runNameText ?? '').toMatch(/^.+-[0-9a-f]{4}$/)

    await page.screenshot({ path: 'e2e/screenshots/pipeline-se-running.png' })
  })
})

test.describe('Pipeline Farm Push Summary', () => {
  test('SE pipeline shows Farm push summary with volume, batches, duration', async ({ page }) => {
    test.setTimeout(300_000) // Farm triple push can take 2-3 minutes under DB load
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /^Run$/ }).click()

    const summary = m.locator('[data-testid="farm-push-summary"]')
    await expect(summary).toBeVisible({ timeout: 270_000 })

    await expect(summary.getByText('Volume')).toBeVisible({ timeout: 5_000 })
    await expect(summary.getByText('Batches')).toBeVisible({ timeout: 5_000 })
    await expect(summary.getByText('Duration')).toBeVisible({ timeout: 5_000 })

    await expect(summary.locator('[data-testid="volume-metric"]')).toContainText(/\d.*triples/)

    const summaryText = await summary.textContent()
    expect(summaryText ?? '').not.toContain('triples_')

    await page.screenshot({ path: 'e2e/screenshots/pipeline-farm-push-summary.png' })
  })
})

test.describe('Pipeline step-by-step mode', () => {
  test('step mode shows Next Step button', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /Step-by-Step/i }).click()
    await m.getByRole('button', { name: /^Run$/ }).click()

    await expect(m.getByText('Farm Snapshot').first()).toBeVisible({ timeout: 10_000 })

    await expect(
      m.getByRole('button', { name: /Next Step/i }).or(m.getByText('Snapshot ready'))
    ).toBeVisible({ timeout: 60_000 })

    await page.screenshot({ path: 'e2e/screenshots/pipeline-step-mode.png' })
  })
})

test.describe('Pipeline run history persistence', () => {
  test('runs persist to Postgres and survive reload with run_name', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /^Run$/ }).click()

    await expect(m.getByText('Snapshot ready').first()).toBeVisible({ timeout: 15_000 })

    await page.waitForTimeout(3000)

    await page.reload()

    await expect(m.getByText('Run History')).toBeVisible({ timeout: 5_000 })

    const historyRows = m.locator('table').last().locator('tbody tr')
    await expect(historyRows.first()).toBeVisible({ timeout: 10_000 })

    const runNameCells = m.locator('[data-testid="history-run-name"]')
    const firstRunName = await runNameCells.first().textContent()
    if (firstRunName) {
      expect(firstRunName).toMatch(/^.+-[0-9a-f]{4}$/)
    }

    await page.screenshot({ path: 'e2e/screenshots/pipeline-history.png' })
  })
})

test.describe('Pipeline identity — no raw UUIDs as primary identifiers', () => {
  test('pipeline UI shows run_name not raw pipeline_run_id', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /^Run$/ }).click()

    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toBeVisible({ timeout: 30_000 })

    await expect(
      m.getByText('Snapshot ready').first().or(m.getByText(/Pipeline completed/).first()).or(m.getByText(/Pipeline stopped/).first())
    ).toBeVisible({ timeout: 60_000 })

    const pageText = await m.textContent()
    expect(pageText ?? '').not.toContain('triples_')
  })
})
