// Operator-visible outcome: Clicking Run on /pipeline renders all 7 spine step cards (Enterprise Snapshot (Farm) → AOD Discovery → Validation Lab Grade → AOD → AAM Handoff → AAM Transport → DCL → Verify Data in Ask & Dashboards → Pipeline Complete) and finishes with "Pipeline completed successfully"; the footer shows an I5 run_name like FluxEdge-a3f2-9c1b; the transport summary's erp/bi/ledger plane record counts equal Farm's financial/operational/ledger record counts fetched at test time (e.g. erp=12, bi=48, ledger=200 for that entity, seed 42); the Validation Lab card shows the same PASS/WARN grade Farm's stored reconciliation reports; the run survives reload in Run History.
import { test, expect, type Page } from '@playwright/test'

const FARM_BASE_URL = process.env.FARM_BASE_URL || 'http://localhost:8003'

function main(page: Page) {
  return page.getByRole('main')
}

/** Parse the StepDetail JSON pane for the currently selected step card. */
async function readStepDetailJson(page: Page): Promise<Record<string, any>> {
  const pre = main(page).locator('[data-testid="step-detail-json"]')
  await expect(pre).toBeVisible({ timeout: 10_000 })
  const text = await pre.textContent()
  return JSON.parse(text ?? '{}')
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

test.describe('Pipeline spine — full batch run vs ground truth', () => {
  test('8 step cards render; transport records and validation grade match Farm at test time', async ({ page }) => {
    test.setTimeout(420_000) // snapshot + scan + grade + handoff + 7-plane transport + verify
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /^Run$/ }).click()

    // All 7 spine cards appear as soon as the job exists.
    await expect(m.getByText('Enterprise Snapshot (Farm)').first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('AOD Discovery').first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('Validation Lab Grade').first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('AAM Handoff', { exact: false }).first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('AAM Transport → DCL').first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('Verify Data in Ask & Dashboards').first()).toBeVisible({ timeout: 10_000 })
    await expect(m.getByText('Pipeline Complete').first()).toBeVisible({ timeout: 10_000 })

    // Green gate: the WHOLE spine must finish clean.
    await expect(m.getByText('Pipeline completed successfully').first()).toBeVisible({ timeout: 390_000 })

    // I5 run_name in the footer; the entity is the run_name minus the
    // pipeline short-hash (e.g. FluxEdge-a3f2-9c1b → FluxEdge-a3f2).
    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toBeVisible({ timeout: 5_000 })
    const runName = (await runNameLabel.textContent()) ?? ''
    expect(runName).toMatch(/^.+-[0-9a-f]{4}$/)
    const entityId = runName.replace(/-[0-9a-f]{4}$/, '')
    expect(entityId).toMatch(/^[A-Z][A-Za-z]+-[0-9a-f]{4}$/)

    // ── Transport vs Farm ground truth (B10: fetched at test time) ──
    // AAM pulls erp/bi/ledger records from Farm with seed=42 (the
    // transport defaults); the SAME read here must yield the SAME counts.
    const gt: Record<string, number> = {}
    for (const [plane, path] of [
      ['erp', 'financial-records'],
      ['bi', 'operational-records'],
      ['ledger', 'ledger-records'],
    ] as const) {
      const resp = await page.request.get(
        `${FARM_BASE_URL}/api/farm/${path}?entity_id=${encodeURIComponent(entityId)}&seed=42`,
      )
      expect(resp.ok()).toBe(true)
      const body = await resp.json()
      expect(body.entity_id).toBe(entityId)
      gt[plane] = Number(body.count)
      expect(Number.isInteger(gt[plane])).toBe(true)
    }

    const summary = m.locator('[data-testid="transport-summary"]')
    await expect(summary).toBeVisible({ timeout: 10_000 })

    // Per-plane records from the transport step detail (the operator's drill).
    await m.getByText('AAM Transport → DCL').first().click()
    const transportData = await readStepDetailJson(page)
    const planes: Array<Record<string, any>> = transportData.planes ?? []
    const byPlane = new Map(planes.map((p) => [p.plane, p]))
    expect(Number(byPlane.get('erp')?.records)).toBe(gt['erp'])
    expect(Number(byPlane.get('bi')?.records)).toBe(gt['bi'])
    expect(Number(byPlane.get('ledger')?.records)).toBe(gt['ledger'])

    // The summary's Records figure equals the sum of every plane's records,
    // and every plane shares ONE combined dcl_ingest_id (one run = one ingest).
    const expectedTotal = planes.reduce((acc, p) => acc + (Number(p.records) || 0), 0)
    const renderedTotal = Number(
      await summary.locator('[data-testid="transport-records"]').getAttribute('data-value'),
    )
    expect(renderedTotal).toBe(expectedTotal)
    const ingestIds = new Set(planes.map((p) => String(p.dcl_ingest_id)))
    expect(ingestIds.size).toBe(1)
    await expect(summary.locator('[data-testid="transport-ingest"]')).toContainText(
      String(planes[0]?.dcl_ingest_id ?? '').slice(0, 8),
    )

    // ── Validation Lab grade vs Farm's stored reconciliation (B10) ──
    await m.getByText('Validation Lab Grade').first().click()
    const validationData = await readStepDetailJson(page)
    const renderedGrade = String(validationData.status ?? '').toUpperCase()
    expect(['PASS', 'WARN']).toContain(renderedGrade)
    const reconciliationId = String(validationData.reconciliation_id ?? '')
    expect(reconciliationId).toMatch(/.+/)
    const reconResp = await page.request.get(
      `${FARM_BASE_URL}/api/reconcile/${encodeURIComponent(reconciliationId)}`,
    )
    expect(reconResp.ok()).toBe(true)
    const recon = await reconResp.json()
    expect(String(recon.status).toUpperCase()).toBe(renderedGrade)
    await expect(m.getByText(`Scan accuracy graded ${renderedGrade}`).first()).toBeVisible({
      timeout: 5_000,
    })

    // No raw internal field names leak to the operator.
    const pageText = await m.textContent()
    expect(pageText ?? '').not.toContain('triples_')

    await page.screenshot({ path: 'e2e/screenshots/pipeline-spine-green.png', fullPage: true })
  })
})

test.describe('Pipeline step-by-step mode', () => {
  test('step mode runs the snapshot step and offers Next Step', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /Step-by-Step/i }).click()
    await m.getByRole('button', { name: /^Run$/ }).click()

    await expect(m.getByText('Enterprise Snapshot (Farm)').first()).toBeVisible({ timeout: 10_000 })

    await expect(
      m.getByRole('button', { name: /Next Step/i }).or(m.getByText(/Enterprise up: entity/).first())
    ).toBeVisible({ timeout: 60_000 })

    await page.screenshot({ path: 'e2e/screenshots/pipeline-step-mode.png' })
  })
})

test.describe('Pipeline run history persistence', () => {
  test('completed runs persist to Postgres with I5 run_name after reload', async ({ page }) => {
    // The full-run test above already persisted a run; this asserts the
    // operator sees it again after a fresh page load — no new run started.
    await page.goto('/pipeline')
    const m = main(page)

    await expect(m.getByText('Run History')).toBeVisible({ timeout: 5_000 })

    const runNameCells = m.locator('[data-testid="history-run-name"]')
    await expect(runNameCells.first()).toBeVisible({ timeout: 10_000 })
    const firstRunName = (await runNameCells.first().textContent()) ?? ''
    expect(firstRunName).toMatch(/^.+-[0-9a-f]{4}$/)

    await page.screenshot({ path: 'e2e/screenshots/pipeline-history.png' })
  })
})
