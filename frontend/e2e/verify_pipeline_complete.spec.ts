// Operator-visible outcome: After running the spine on /pipeline, the "Validation Lab Grade" card shows "Scan accuracy graded PASS" (or WARN) and the "Verify Data in Ask & Dashboards" card succeeds with "Data visible in NLQ — Ask answered <number> from DCL" for the run's freshly minted entity. With nlq-backend stopped, the same Verify card surfaces a plain-English failure containing "NLQ pipeline status unreachable" or "connection refused" referencing port 8005.
import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'

function main(page: Page) {
  return page.getByRole('main')
}

function pm2(cmd: 'stop' | 'start' | 'restart', name: string) {
  execSync(`pm2 ${cmd} ${name}`, { stdio: 'pipe' })
}

async function waitForStepStatus(
  page: Page,
  expected: 'success' | 'failed',
  timeoutMs: number,
): Promise<void> {
  const m = main(page)
  if (expected === 'success') {
    await expect(
      m.getByText(/Data visible in NLQ/i).first(),
    ).toBeVisible({ timeout: timeoutMs })
  } else {
    await expect(
      m
        .getByText(/unreachable|connection refused|HTTP \d\d\d/i)
        .first(),
    ).toBeVisible({ timeout: timeoutMs })
  }
}

test.describe('Spine verify step — green path (NLQ data visible)', () => {
  test('full spine run ends with graded scan and Verify Data in Ask & Dashboards SUCCESS', async ({ page }) => {
    test.setTimeout(420_000) // full spine incl. 7-plane AAM transport
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /^Run$/ }).click()

    await expect(
      m.getByText('Verify Data in Ask & Dashboards').first(),
    ).toBeVisible({ timeout: 10_000 })

    await expect(
      m.getByText(/Pipeline completed|Pipeline stopped/).first(),
    ).toBeVisible({ timeout: 390_000 })

    // The Validation Lab gate must have graded this run's scan (PASS or WARN
    // — FAIL stops the pipeline and fails the assertion below).
    await expect(
      m.getByText(/Scan accuracy graded (PASS|WARN)/).first(),
    ).toBeVisible({ timeout: 5_000 })

    await waitForStepStatus(page, 'success', 5_000)

    await expect(m.getByText('Pipeline Complete').first()).toBeVisible({ timeout: 5_000 })

    await m.getByText('Verify Data in Ask & Dashboards').first().click()

    await page.screenshot({
      path: 'e2e/screenshots/verify-se-green.png',
      fullPage: true,
    })
  })
})

test.describe('Spine verify step — force-fail (nlq-backend down)', () => {
  test.afterEach(() => {
    try {
      pm2('start', 'nlq-backend')
    } catch {
      // Swallow — the test result already tells the operator what happened.
    }
  })

  test('spine run with nlq-backend stopped shows verify step FAILED with plain-English message', async ({ page }) => {
    test.setTimeout(420_000)

    pm2('stop', 'nlq-backend')

    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /^Run$/ }).click()

    await expect(
      m.getByText('Verify Data in Ask & Dashboards').first(),
    ).toBeVisible({ timeout: 10_000 })

    await expect(
      m.getByText(/Pipeline completed|Pipeline stopped/).first(),
    ).toBeVisible({ timeout: 390_000 })

    await expect(
      m
        .getByText(/NLQ pipeline status unreachable|connection refused.*8005|Verify NLQ is running/i)
        .first(),
    ).toBeVisible({ timeout: 5_000 })

    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toBeVisible({ timeout: 5_000 })
    const runNameText = await runNameLabel.textContent()
    expect(runNameText ?? '').toMatch(/^.+-[0-9a-f]{4}$/)

    await page.screenshot({
      path: 'e2e/screenshots/verify-se-force-fail.png',
      fullPage: true,
    })
  })
})
