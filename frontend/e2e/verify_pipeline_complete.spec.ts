import { test, expect, type Page, request as pwRequest } from '@playwright/test'
import { execSync } from 'child_process'

// B17 Playwright gate for the new post-pipeline verify steps:
//   SE → "Verify Data in Ask & Dashboards" (_step_nlq_data_visible)
//   ME → "Verify Merge, Engagements, Reports" (_step_convergence_surfaces_visible)
//
// Coverage strategy:
//   • SE green + ME green are live full-pipeline runs. They prove the real
//     handler runs end-to-end and the UI surfaces the success message the
//     operator would actually see.
//   • SE force-fail runs with nlq-backend stopped (NLQ is only touched by
//     the verify step, so every earlier SE step still succeeds). The test
//     restarts NLQ at the end via test.afterEach so a failure mid-run does
//     not leave the environment broken.
//   • ME force-fail is deliberately NOT a Playwright test: Convergence is
//     hit by farm_financials_a/b, cofa_unification, AND verify, so stopping
//     convergence-backend blows up earlier stages before the verify step is
//     reached. Every failure path of _step_convergence_surfaces_visible is
//     covered exhaustively by backend unit tests in tests/test_pipeline.py
//     (test_run_me_pipeline_verify_*).
//
// Pre-warm: Supabase drops idle PG connections after ~60s, so the first
// heavy query after idle incurs a stale-handle recycle. Before running any
// test we poke Convergence QofE + the AOD health endpoint to force any
// stale connections out of the pools. This is a test-fixture detail, not a
// workaround for the handlers themselves.

const TENANT_ID = '69688df3-fc8e-51f8-a77c-9c13f9b3a784'
const CONVERGENCE_URL = process.env.CONVERGENCE_URL || 'http://localhost:8010'
const AOD_URL = process.env.AOD_URL || 'http://localhost:8001'

test.beforeAll(async () => {
  const ctx = await pwRequest.newContext()
  try {
    // Prime Convergence QofE (the heaviest query in the verify step) so a
    // stale-connection recycle happens before the real tests start.
    await ctx.get(
      `${CONVERGENCE_URL}/api/convergence/reports/v2/qoe/combined?tenant_id=${TENANT_ID}`,
      { timeout: 60_000 },
    )
    // Prime AOD so its asyncpg pool is warm too.
    await ctx.get(`${AOD_URL}/api/health`, { timeout: 10_000 })
  } finally {
    await ctx.dispose()
  }
})

function main(page: Page) {
  return page.getByRole('main')
}

function pm2(cmd: 'stop' | 'start' | 'restart', name: string) {
  execSync(`pm2 ${cmd} ${name}`, { stdio: 'pipe' })
}

async function waitForStepStatus(
  page: Page,
  displayName: string,
  expected: 'success' | 'failed',
  timeoutMs: number,
): Promise<void> {
  // The step card renders the display_name as the only text; the status is
  // encoded in the card border color + StatusIcon + message color. There's
  // no per-card data-testid, so match by the message text we know the
  // handler emits for each terminal state.
  const m = main(page)
  if (expected === 'success') {
    // Success messages begin with a handler-specific prefix.
    const successPrefixes: Record<string, RegExp> = {
      'Verify Data in Ask & Dashboards': /Data visible in NLQ/i,
      'Verify Merge, Engagements, Reports': /Convergence surfaces verified/i,
    }
    await expect(
      m.getByText(successPrefixes[displayName]!).first(),
    ).toBeVisible({ timeout: timeoutMs })
  } else {
    // Failure messages for NLQ/Convergence verify all include one of these
    // tokens. "unreachable" covers connection refused + timeout wording.
    await expect(
      m
        .getByText(/unreachable|connection refused|HTTP \d\d\d|would fail for users/i)
        .first(),
    ).toBeVisible({ timeout: timeoutMs })
  }
}

async function clickMeEngagementAndRun(page: Page): Promise<void> {
  const m = main(page)
  await m.getByRole('button', { name: 'ME', exact: true }).click()
  const dropdown = m.locator('[data-testid="me-engagement-dropdown"]')
  await expect(dropdown).toBeVisible({ timeout: 5_000 })
  // Wait for a real option (not loading/error/empty placeholder).
  const realOption = dropdown.locator('option[value]:not([value=""])').first()
  await expect(realOption).toBeAttached({ timeout: 10_000 })
  await m.getByRole('button', { name: /Run ME/i }).click()
  await expect(m.getByText('ME Mode')).toBeVisible({ timeout: 10_000 })
}

// ── SE verify: green path ───────────────────────────────────────────

test.describe('SE verify step — green path (NLQ data visible)', () => {
  test('full SE pipeline ends with Verify Data in Ask & Dashboards SUCCESS', async ({ page }) => {
    test.setTimeout(300_000) // Farm push can take 2-3 min under load
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /Run SE/i }).click()
    await expect(m.getByText('SE Mode')).toBeVisible({ timeout: 10_000 })

    // The new verify step must appear as a card.
    await expect(
      m.getByText('Verify Data in Ask & Dashboards').first(),
    ).toBeVisible({ timeout: 10_000 })

    // Wait for pipeline to terminate.
    await expect(
      m.getByText(/Pipeline completed|Pipeline stopped/).first(),
    ).toBeVisible({ timeout: 270_000 })

    // Verify step must have reached SUCCESS with the NLQ handler's message.
    await waitForStepStatus(
      page,
      'Verify Data in Ask & Dashboards',
      'success',
      5_000,
    )

    // The final "Pipeline Complete" card should also be present.
    await expect(m.getByText('Pipeline Complete').first()).toBeVisible()

    // Click the verify step to open StepDetail and confirm provenance renders.
    await m.getByText('Verify Data in Ask & Dashboards').first().click()

    await page.screenshot({
      path: 'e2e/screenshots/verify-se-green.png',
      fullPage: true,
    })
  })
})

// ── ME verify: green path ───────────────────────────────────────────

test.describe('ME verify step — green path (Convergence surfaces visible)', () => {
  test('full ME pipeline ends with Verify Merge, Engagements, Reports SUCCESS', async ({ page }) => {
    test.setTimeout(420_000) // ME is heavier: two farm pushes + COFA + verify
    await page.goto('/pipeline')
    const m = main(page)

    await clickMeEngagementAndRun(page)

    await expect(
      m.getByText('Verify Merge, Engagements, Reports').first(),
    ).toBeVisible({ timeout: 15_000 })

    await expect(
      m.getByText(/Pipeline completed|Pipeline stopped/).first(),
    ).toBeVisible({ timeout: 390_000 })

    await waitForStepStatus(
      page,
      'Verify Merge, Engagements, Reports',
      'success',
      5_000,
    )

    await expect(m.getByText('Pipeline Complete').first()).toBeVisible()

    await m.getByText('Verify Merge, Engagements, Reports').first().click()

    await page.screenshot({
      path: 'e2e/screenshots/verify-me-green.png',
      fullPage: true,
    })
  })
})

// ── SE verify: force-fail path ──────────────────────────────────────

test.describe('SE verify step — force-fail (nlq-backend down)', () => {
  test.afterEach(() => {
    // Always restart NLQ, even if the test body failed partway through.
    try {
      pm2('start', 'nlq-backend')
    } catch {
      // Swallow — the test result already tells the operator what happened.
    }
  })

  test('SE pipeline with nlq-backend stopped shows verify step FAILED with plain-English message', async ({ page }) => {
    test.setTimeout(300_000)

    // Stop NLQ before starting the pipeline — earlier SE steps do not touch
    // NLQ, so they all pass, and the verify step hits a refused connection.
    pm2('stop', 'nlq-backend')

    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /Run SE/i }).click()
    await expect(m.getByText('SE Mode')).toBeVisible({ timeout: 10_000 })

    await expect(
      m.getByText('Verify Data in Ask & Dashboards').first(),
    ).toBeVisible({ timeout: 10_000 })

    await expect(
      m.getByText(/Pipeline completed|Pipeline stopped/).first(),
    ).toBeVisible({ timeout: 270_000 })

    // Handler emits "NLQ pipeline status unreachable at ... connection refused"
    // or a similar phrase depending on which probe fails first.
    await expect(
      m
        .getByText(/NLQ pipeline status unreachable|connection refused.*8005|Verify NLQ is running/i)
        .first(),
    ).toBeVisible({ timeout: 5_000 })

    // Surface still shows the run_name so operator can correlate with logs.
    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toBeVisible()
    const runNameText = await runNameLabel.textContent()
    expect(runNameText).toBeTruthy()

    await page.screenshot({
      path: 'e2e/screenshots/verify-se-force-fail.png',
      fullPage: true,
    })
  })
})
