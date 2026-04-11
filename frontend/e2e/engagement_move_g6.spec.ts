/**
 * G6 — SE pipeline runs end-to-end through Console UI.
 * Verifies the engagement move didn't break the SE pipeline path.
 */
import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

test.describe('G6 — SE pipeline end-to-end through UI', () => {
  test.setTimeout(300_000)

  test('SE pipeline completes 6/6', async ({ page }) => {
    let capturedPostBody: string | null = null
    page.on('request', (req) => {
      if (req.url().includes('/api/pipeline/start') && req.method() === 'POST') {
        capturedPostBody = req.postData()
        console.log('[G6] Captured POST body:', capturedPostBody)
      }
    })

    await page.goto('/pipeline')
    const m = main(page)

    // SE mode should be default
    await expect(m.getByRole('button', { name: /Run SE/i })).toBeVisible()

    // Click Run SE
    await m.getByRole('button', { name: /Run SE/i }).click()

    // Verify POST body
    await page.waitForTimeout(1000)
    expect(capturedPostBody).toBeTruthy()
    const postBody = JSON.parse(capturedPostBody!)
    console.log('[G6] Parsed POST body:', JSON.stringify(postBody, null, 2))
    expect(postBody.mode).toBe('se')

    // Wait for pipeline to start
    await expect(m.getByText('SE Mode')).toBeVisible({ timeout: 10_000 })

    // Poll the API for completion instead of relying on DOM text
    let latestRun: Record<string, unknown> | null = null
    const deadline = Date.now() + 270_000
    while (Date.now() < deadline) {
      const resp = await page.request.get('/api/pipeline/runs?limit=1')
      const data = await resp.json()
      const run = data.runs?.[0]
      if (run && run.pipeline_mode === 'se' &&
          (run.status === 'completed' || run.status === 'completed_with_errors' || run.status === 'failed')) {
        latestRun = run
        break
      }
      await page.waitForTimeout(3000)
    }

    expect(latestRun, 'SE pipeline must finish within timeout').toBeTruthy()

    await page.screenshot({ path: 'e2e/screenshots/g6-se-pipeline-final.png' })

    console.log('[G6] Latest run:', JSON.stringify({
      status: latestRun!.status,
      run_name: latestRun!.run_name,
      mode: latestRun!.pipeline_mode,
      step_count: (latestRun!.steps as unknown[]).length,
      steps: (latestRun!.steps as { name: string; status: string; message?: string }[]).map(s =>
        `${s.name}: ${s.status} — ${(s.message ?? '').substring(0, 80)}`
      ),
    }, null, 2))

    // Must be completed
    expect(latestRun!.status).toBe('completed')

    // Must have 6 steps
    expect((latestRun!.steps as unknown[]).length).toBe(6)

    // All steps must be success
    for (const step of latestRun!.steps as { name: string; status: string }[]) {
      expect(step.status, `Step ${step.name} must be success`).toBe('success')
    }

    // run_name should be visible and not a raw UUID
    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toBeVisible()
    const runName = await runNameLabel.textContent()
    console.log('[G6] run_name:', runName)
    expect(runName!.length).toBeLessThan(36)
  })
})
