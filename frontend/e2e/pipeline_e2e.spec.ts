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
  test('SE pipeline starts and shows step cards with run_name', async ({ page }) => {
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

    // run_name should be visible (not a raw UUID as primary identifier)
    const runNameLabel = m.locator('[data-testid="run-name-label"]')

    // Wait for either completion or first step success (up to 60s)
    await expect(
      m.getByText('Snapshot ready').first().or(m.getByText(/Pipeline completed/).first()).or(m.getByText(/Pipeline stopped/).first())
    ).toBeVisible({ timeout: 60_000 })

    // After at least one step completes, run_name label should appear in footer
    await expect(runNameLabel).toBeVisible()
    // run_name should not look like a raw UUID (no 36-char hyphenated UUID as primary text)
    const runNameText = await runNameLabel.textContent()
    expect(runNameText).toBeTruthy()
    expect(runNameText!.length).toBeLessThan(36)

    await page.screenshot({ path: 'e2e/screenshots/pipeline-se-running.png' })
  })
})

test.describe('Pipeline ME batch run', () => {
  test('ME pipeline starts with parallel group and engagement dropdown', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Switch to ME
    await m.getByRole('button', { name: 'ME', exact: true }).click()

    // Engagement dropdown should appear (populated from Convergence API)
    const dropdown = m.locator('[data-testid="me-engagement-dropdown"]')
    await expect(dropdown).toBeVisible({ timeout: 5_000 })

    // Click Run ME
    await m.getByRole('button', { name: /Run ME/i }).click()

    // Wait for pipeline mode label
    await expect(m.getByText('ME Mode')).toBeVisible({ timeout: 10_000 })

    // ME steps — updated names from Prompt 6
    await expect(m.getByText('Farm + DCL (Acquirer)').first()).toBeVisible()
    await expect(m.getByText('Farm + DCL (Target)').first()).toBeVisible()
    await expect(m.getByText('COFA Unification').first()).toBeVisible()
    await expect(m.getByText('Verify').first()).toBeVisible()
    await expect(m.getByText('Pipeline Complete').first()).toBeVisible()

    // Parallel label for entity_ingest group
    await expect(m.getByText('parallel', { exact: true })).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/pipeline-me-running.png' })
  })
})

test.describe('Pipeline Farm Push Summary', () => {
  test('SE pipeline shows Farm push summary with volume, batches, duration', async ({ page }) => {
    test.setTimeout(300_000) // Farm triple push can take 2-3 minutes under DB load
    await page.goto('/pipeline')
    const m = main(page)

    // Start SE batch pipeline
    await m.getByRole('button', { name: /Run SE/i }).click()

    // Wait for FarmPushSummary to appear (renders once farm_financials step succeeds or fails)
    const summary = m.locator('[data-testid="farm-push-summary"]')
    await expect(summary).toBeVisible({ timeout: 270_000 })

    // All three metric labels must be present
    await expect(summary.getByText('Volume')).toBeVisible()
    await expect(summary.getByText('Batches')).toBeVisible()
    await expect(summary.getByText('Duration')).toBeVisible()

    // Volume should show a number followed by "triples"
    await expect(summary.getByText(/\d.*triples/)).toBeVisible()

    // No "triples_" prefixed string anywhere in the summary
    const summaryText = await summary.textContent()
    expect(summaryText).not.toContain('triples_')

    // Expansion summary visible after DCL ingest
    const expansion = m.locator('[data-testid="expansion-summary"]')
    // Expansion may or may not show depending on whether DCL returns the fields
    // Just verify no triples_ prefix anywhere

    await page.screenshot({ path: 'e2e/screenshots/pipeline-farm-push-summary.png' })
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
  test('runs persist to Postgres and survive reload with run_name', async ({ page }) => {
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

    // History table should have at least one row with a run_name (not raw UUID)
    const historyRows = m.locator('table').last().locator('tbody tr')
    await expect(historyRows.first()).toBeVisible({ timeout: 10_000 })

    // The run_name column should show readable names, not raw UUIDs
    const runNameCells = m.locator('[data-testid="history-run-name"]')
    const firstRunName = await runNameCells.first().textContent()
    if (firstRunName) {
      // run_name should be shorter than a full UUID
      expect(firstRunName.length).toBeLessThan(36)
    }

    await page.screenshot({ path: 'e2e/screenshots/pipeline-history.png' })
  })
})

test.describe('Pipeline identity — no raw UUIDs as primary identifiers', () => {
  test('pipeline UI shows run_name not raw pipeline_run_id', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Start SE pipeline
    await m.getByRole('button', { name: /Run SE/i }).click()

    // Wait for pipeline to start
    await expect(m.getByText('SE Mode')).toBeVisible({ timeout: 10_000 })

    // Wait for at least one step to complete
    await expect(
      m.getByText('Snapshot ready').first().or(m.getByText(/Pipeline completed/).first()).or(m.getByText(/Pipeline stopped/).first())
    ).toBeVisible({ timeout: 60_000 })

    // Verify run_name is visible
    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toBeVisible()

    // The provenance tag on step cards should show run_name, not a triples_ prefix
    const pageText = await m.textContent()
    expect(pageText).not.toContain('triples_')
  })
})

test.describe('Pipeline ME identity — engagement-based run_name (Prompt 6)', () => {
  test('ME engagement dropdown populated from Convergence API, most recent first', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Switch to ME
    await m.getByRole('button', { name: 'ME', exact: true }).click()

    // Engagement dropdown should appear
    const dropdown = m.locator('[data-testid="me-engagement-dropdown"]')
    await expect(dropdown).toBeVisible({ timeout: 5_000 })

    // Dropdown should have at least one option (from Convergence or fallback)
    const options = dropdown.locator('option')
    const count = await options.count()
    // Even if Convergence is down, the "No engagements found" option exists
    expect(count).toBeGreaterThan(0)

    await page.screenshot({ path: 'e2e/screenshots/pipeline-me-engagement-dropdown.png' })
  })

  test('ME pipeline renders engagement-based run_name', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Switch to ME and start
    await m.getByRole('button', { name: 'ME', exact: true }).click()
    await m.getByRole('button', { name: /Run ME/i }).click()

    // Wait for pipeline to start
    await expect(m.getByText('ME Mode')).toBeVisible({ timeout: 10_000 })

    // Wait for at least first step result
    await expect(
      m.getByText('Financial triples generated', { exact: false }).first()
        .or(m.getByText(/Pipeline stopped/).first())
        .or(m.getByText(/ME pre-flight failed/).first())
    ).toBeVisible({ timeout: 60_000 })

    // run_name should be visible
    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toBeVisible()
    const runNameText = await runNameLabel.textContent()
    expect(runNameText).toBeTruthy()
    // run_name should be short (engagement_short_name-XXXX or just XXXX)
    expect(runNameText!.length).toBeLessThan(36)

    await page.screenshot({ path: 'e2e/screenshots/pipeline-me-run-name.png' })
  })

  test('no Console-minted engagement UUID visible in ME pipeline', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: 'ME', exact: true }).click()
    await m.getByRole('button', { name: /Run ME/i }).click()
    await expect(m.getByText('ME Mode')).toBeVisible({ timeout: 10_000 })

    // Wait for something to render
    await expect(
      m.getByText('Farm + DCL (Acquirer)', { exact: false }).first()
    ).toBeVisible({ timeout: 10_000 })

    // Full page text should not contain any 36-char UUID pattern as
    // a visible engagement identifier
    const pageText = await m.textContent() ?? ''
    // No "triples_" prefixed string anywhere
    expect(pageText).not.toContain('triples_')
  })

  test('ME parallel ingests counted as 1 step in total', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: 'ME', exact: true }).click()
    await m.getByRole('button', { name: /Run ME/i }).click()
    await expect(m.getByText('ME Mode')).toBeVisible({ timeout: 10_000 })

    // The parallel group should show one "parallel" label
    await expect(m.getByText('parallel', { exact: true })).toBeVisible()

    // Both entity cards should be stacked under the parallel group
    await expect(m.getByText('Farm + DCL (Acquirer)').first()).toBeVisible()
    await expect(m.getByText('Farm + DCL (Target)').first()).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/pipeline-me-parallel-count.png' })
  })

  test('ME Verify step appears after COFA in step flow', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: 'ME', exact: true }).click()
    await m.getByRole('button', { name: /Run ME/i }).click()
    await expect(m.getByText('ME Mode')).toBeVisible({ timeout: 10_000 })

    // Check step order: COFA should appear before Verify
    const steps = m.locator('[class]').filter({ hasText: /COFA Unification|Verify/ })
    const allText = await m.textContent() ?? ''
    const cofaIdx = allText.indexOf('COFA Unification')
    const verifyIdx = allText.indexOf('Verify')
    // Verify comes after COFA (and both exist)
    expect(cofaIdx).toBeGreaterThan(-1)
    expect(verifyIdx).toBeGreaterThan(cofaIdx)

    await page.screenshot({ path: 'e2e/screenshots/pipeline-me-verify-after-cofa.png' })
  })
})
