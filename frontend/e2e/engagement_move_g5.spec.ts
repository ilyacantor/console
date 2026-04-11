/**
 * G5 — ME pipeline runs end-to-end through Console UI.
 * Selects real engagement from dropdown, runs ME, waits for completed 6/6.
 */
import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

const REAL_ENGAGEMENT_ID = '3c299509-3219-47ae-a751-9b554f60510a'

test.describe('G5 — ME pipeline end-to-end through UI', () => {
  test.setTimeout(180_000)

  test('ME pipeline completes 6/6 with real engagement', async ({ page }) => {
    // Capture the POST /api/pipeline/start request
    let capturedPostBody: string | null = null
    page.on('request', (req) => {
      if (req.url().includes('/api/pipeline/start') && req.method() === 'POST') {
        capturedPostBody = req.postData()
        console.log('[G5] Captured POST body:', capturedPostBody)
      }
    })

    await page.goto('/pipeline')
    const m = main(page)

    // Switch to ME
    await m.getByRole('button', { name: 'ME', exact: true }).click()

    // Wait for dropdown to load
    const dropdown = m.locator('[data-testid="me-engagement-dropdown"]')
    await expect(dropdown).toBeVisible({ timeout: 5_000 })

    // Select the real engagement
    await dropdown.selectOption(REAL_ENGAGEMENT_ID)

    // Verify it's selected
    const selectedValue = await dropdown.inputValue()
    expect(selectedValue).toBe(REAL_ENGAGEMENT_ID)
    console.log('[G5] Selected engagement:', selectedValue)

    // Click Run ME
    await m.getByRole('button', { name: /Run ME/i }).click()

    // Verify POST body contains real engagement_id
    await page.waitForTimeout(1000)
    expect(capturedPostBody).toBeTruthy()
    const postBody = JSON.parse(capturedPostBody!)
    console.log('[G5] Parsed POST body:', JSON.stringify(postBody, null, 2))
    expect(postBody.mode).toBe('me')
    expect(postBody.config.convergence_engagement_id).toBe(REAL_ENGAGEMENT_ID)

    // Wait for pipeline to start — "ME Mode" label appears in active run area
    await expect(m.getByText('ME Mode')).toBeVisible({ timeout: 10_000 })

    // Poll for the "Pipeline Complete" step card to show success status.
    // The complete step card contains "Pipeline completed" text.
    // Use .first() to grab the active run area (not run history below).
    await expect(
      m.getByText('Pipeline completed').first()
        .or(m.getByText('Pipeline stopped').first())
    ).toBeVisible({ timeout: 150_000 })

    // Capture the final state
    await page.screenshot({ path: 'e2e/screenshots/g5-me-pipeline-final.png' })

    // Read status from the pipeline status API for this run
    const statusResp = await page.request.get('/api/pipeline/runs?limit=1')
    const statusData = await statusResp.json()
    const latestRun = statusData.runs[0]

    console.log('[G5] Latest run:', JSON.stringify({
      status: latestRun.status,
      run_name: latestRun.run_name,
      mode: latestRun.pipeline_mode,
      step_count: latestRun.steps.length,
      steps: latestRun.steps.map((s: { name: string; status: string; message?: string }) =>
        `${s.name}: ${s.status}`
      ),
    }, null, 2))

    // Must be ME mode
    expect(latestRun.pipeline_mode).toBe('me')

    // Must be completed (not completed_with_errors)
    expect(latestRun.status).toBe('completed')

    // Must have 6 steps
    expect(latestRun.steps.length).toBe(6)

    // All steps must be success
    for (const step of latestRun.steps) {
      expect(step.status, `Step ${step.name} must be success`).toBe('success')
    }

    // run_name should contain MerCas (engagement short name)
    expect(latestRun.run_name).toContain('MerCas')

    // Verify engagement label in the UI
    const engLabel = m.locator('[data-testid="engagement-label"]')
    await expect(engLabel).toBeVisible()
    const engText = await engLabel.textContent()
    console.log('[G5] engagement label:', engText)
    expect(engText).toContain('MerCas')

    // Verify run_name label
    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toBeVisible()
    const runName = await runNameLabel.textContent()
    console.log('[G5] run_name:', runName)
    expect(runName).toContain('MerCas')
  })
})
