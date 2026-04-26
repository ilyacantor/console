// Operator-visible outcome: After running the SE pipeline on /pipeline, the "Verify Data in Ask & Dashboards" step card succeeds with the message "Data visible in NLQ — Ask answered ... from DCL". With nlq-backend stopped, the same step card surfaces a plain-English failure containing "NLQ pipeline status unreachable" or "connection refused" referencing port 8005.
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

test.describe('SE verify step — green path (NLQ data visible)', () => {
  test('full SE pipeline ends with Verify Data in Ask & Dashboards SUCCESS', async ({ page }) => {
    test.setTimeout(300_000) // Farm push can take 2-3 min under load
    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /^Run$/ }).click()

    await expect(
      m.getByText('Verify Data in Ask & Dashboards').first(),
    ).toBeVisible({ timeout: 10_000 })

    await expect(
      m.getByText(/Pipeline completed|Pipeline stopped/).first(),
    ).toBeVisible({ timeout: 270_000 })

    await waitForStepStatus(page, 'success', 5_000)

    await expect(m.getByText('Pipeline Complete').first()).toBeVisible({ timeout: 5_000 })

    await m.getByText('Verify Data in Ask & Dashboards').first().click()

    await page.screenshot({
      path: 'e2e/screenshots/verify-se-green.png',
      fullPage: true,
    })
  })
})

test.describe('SE verify step — force-fail (nlq-backend down)', () => {
  test.afterEach(() => {
    try {
      pm2('start', 'nlq-backend')
    } catch {
      // Swallow — the test result already tells the operator what happened.
    }
  })

  test('SE pipeline with nlq-backend stopped shows verify step FAILED with plain-English message', async ({ page }) => {
    test.setTimeout(300_000)

    pm2('stop', 'nlq-backend')

    await page.goto('/pipeline')
    const m = main(page)

    await m.getByRole('button', { name: /^Run$/ }).click()

    await expect(
      m.getByText('Verify Data in Ask & Dashboards').first(),
    ).toBeVisible({ timeout: 10_000 })

    await expect(
      m.getByText(/Pipeline completed|Pipeline stopped/).first(),
    ).toBeVisible({ timeout: 270_000 })

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
