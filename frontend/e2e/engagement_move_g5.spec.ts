// Operator-visible outcome: after picking MerCas from the ME dropdown, switching to Batch, and clicking Run ME on /pipeline, the active run card shows "ME Mode", the run-name label shows "MerCas-<4hex>", the engagement label shows "Engagement: MerCas", all 7 ME step cards render with success-green border rgb(74,222,128) and display names (Farm + Convergence (Acquirer), Farm + Convergence (Target), Convergence Multi-Entity Overlay, COFA Unification, Verify, Verify Merge, Engagements, Reports, Pipeline Complete), the footer shows "Completed: <time>", and the page contains zero red-bordered step cards, zero red/amber health dots, and zero error-banner divs (color rgb(252,165,165)).
import { test, expect, type Page } from '@playwright/test'

function main(page: Page) {
  return page.getByRole('main')
}

// Ground truth: create_me_steps() in console/backend/app/services/pipeline_orchestrator.py
// defines exactly these 7 display_name strings in this order. Keep in sync.
const ME_STEP_DISPLAY_NAMES = [
  'Farm + Convergence (Acquirer)',
  'Farm + Convergence (Target)',
  'Convergence Multi-Entity Overlay',
  'COFA Unification',
  'Verify',
  'Verify Merge, Engagements, Reports',
  'Pipeline Complete',
] as const

// Status colors (Pipeline.tsx statusBorderBg). Rendered in computed style as
// rgb() / rgba() with spaces after commas in every modern engine.
const SUCCESS_RGB_FRAGMENT = '74, 222, 128'   // #4ADE80 — success step card
const FAILED_RGB_FRAGMENT = '248, 113, 113'   // #F87171 — failed step card
const ERROR_BANNER_RGB = 'rgb(252, 165, 165)' // #FCA5A5 — inline error banner text
// HealthStrip (HealthStrip.tsx STATUS_COLORS): degraded amber + down red.
const HEALTH_DOWN_RGB = 'rgb(239, 68, 68)'
const HEALTH_DEGRADED_RGB = 'rgb(245, 158, 11)'

test.describe('G5 UI-only — ME batch is clean green on the /pipeline page', () => {
  test.setTimeout(180_000)

  test('all 7 ME stages show success-green, no errors, no advisories anywhere on the page', async ({ page }) => {
    await page.goto('/pipeline')
    const m = main(page)

    // Switch to ME + Batch (default is SE + Batch)
    await m.getByRole('button', { name: 'ME', exact: true }).click()
    await m.getByRole('button', { name: 'Batch', exact: true }).click()

    // Wait for the engagement dropdown to populate
    const dropdown = m.locator('[data-testid="me-engagement-dropdown"]')
    await expect(dropdown).toBeVisible({ timeout: 5_000 })

    // Pick MerCas by label — the option text is engagement_short_name.
    await dropdown.selectOption({ label: 'MerCas' })
    await expect(dropdown).toHaveValue(/^[0-9a-f-]{36}$/)

    // Kick off the batch run
    await m.getByRole('button', { name: /Run ME/i }).click()

    // Terminal signal: the active run card footer renders "Completed: <time>"
    // only when jobData.completed_at is set (terminal state reached).
    await expect(m.getByText(/^Completed: /).first()).toBeVisible({ timeout: 150_000 })

    // Active run card header: "ME Mode"
    await expect(m.getByText('ME Mode', { exact: true }).first()).toBeVisible({ timeout: 5_000 })

    // Every one of the 7 ME step display names is visible on the page.
    // 'Verify' requires exact: true to not collide with 'Verify Merge, …'.
    for (const label of ME_STEP_DISPLAY_NAMES) {
      const locator = label === 'Verify'
        ? m.getByText(label, { exact: true })
        : m.getByText(label).first()
      await expect(locator).toBeVisible({ timeout: 5_000 })
    }

    // Count step-card divs whose computed border-color is the success green.
    // Every green border in Pipeline.tsx corresponds to a success step card.
    const greenCardCount = await page.evaluate((rgbFragment) => {
      return Array.from(document.querySelectorAll('div')).filter((d) => {
        const s = window.getComputedStyle(d)
        return s.borderStyle === 'solid' && s.borderColor.includes(rgbFragment)
      }).length
    }, SUCCESS_RGB_FRAGMENT)
    expect(greenCardCount).toBe(ME_STEP_DISPLAY_NAMES.length)

    // No red-bordered step card (failed) may exist anywhere on the page.
    const failedCardCount = await page.evaluate((rgbFragment) => {
      return Array.from(document.querySelectorAll('div')).filter((d) => {
        const s = window.getComputedStyle(d)
        return s.borderStyle === 'solid' && s.borderColor.includes(rgbFragment)
      }).length
    }, FAILED_RGB_FRAGMENT)
    expect(failedCardCount).toBe(0)

    // No inline error-banner text may be rendered (banner uses color #FCA5A5).
    const errorBannerCount = await page.evaluate((rgbVal) => {
      return Array.from(document.querySelectorAll('div')).filter((d) => {
        return window.getComputedStyle(d).color === rgbVal
      }).length
    }, ERROR_BANNER_RGB)
    expect(errorBannerCount).toBe(0)

    // No HealthStrip dot is in degraded (amber) or down (red) state.
    // Scoped to data-testid="health-strip" so sidebar nav dots (also
    // amber/red) are not counted.
    const unhealthyDotCount = await page.evaluate(([down, degraded]) => {
      const strip = document.querySelector('[data-testid="health-strip"]')
      if (!strip) return -1
      return Array.from(strip.querySelectorAll('span')).filter((el) => {
        const bg = window.getComputedStyle(el).backgroundColor
        return bg === down || bg === degraded
      }).length
    }, [HEALTH_DOWN_RGB, HEALTH_DEGRADED_RGB])
    expect(unhealthyDotCount).toBe(0)

    // Run-name label: MerCas-<4 lowercase hex>
    const runNameLabel = m.locator('[data-testid="run-name-label"]')
    await expect(runNameLabel).toHaveText(/^MerCas-[0-9a-f]{4}$/)

    // Engagement label: "Engagement: MerCas"
    const engLabel = m.locator('[data-testid="engagement-label"]')
    await expect(engLabel).toHaveText('Engagement: MerCas')

    // Evidence screenshot — requested by operator as proof of clean green state.
    await page.screenshot({
      path: 'e2e/screenshots/g5-me-all-green.png',
      fullPage: true,
    })
  })
})
