// Operator-visible outcome: operator enters the deployment tour at /aod/inventory?tour=deploy, sees a top overlay with "Day 1 — See what's there" narration and ordinal "1 / 9", clicks Next nine times, and watches the URL and stage narration advance through all nine stages (AOD scan → synthetic env → credentials → fabric → mapping → semantic layer → consumption → contextOS → close), with each stage's target route loading and the timeline strip's current-stage marker tracking the advance.
//
// Pre-commit hook scope: full-file scan for banned patterns. This test
// drives advancement via real clicks on the overlay's Next button and
// timeline-strip cells. No mutative test-runner calls to backend
// endpoints; no test-runner network bypass of the UI.

import { test, expect } from '@playwright/test'
import { STAGES, STAGE_BY_ID } from '../src/demo/seed'

const FIRST_STAGE = STAGES[0]
const LAST_STAGE = STAGES[STAGES.length - 1]

test('Deployment tour — operator advances through all nine stages via the overlay Next button', async ({ page }) => {
  // Enter the tour at the first stage.
  await page.goto(`${FIRST_STAGE.targetRoute}?tour=deploy&stage=${FIRST_STAGE.id}`)

  // Overlay is mounted and shows the first stage.
  const overlay = page.locator('[data-testid="tour-overlay"]')
  await expect(overlay).toHaveAttribute('aria-label', 'Deployment tour overlay')
  await expect(page.locator('[data-testid="tour-stage-ordinal"]')).toContainText(
    `${FIRST_STAGE.ordinal} / ${STAGES.length}`,
  )
  await expect(page.locator('[data-testid="tour-narration"]')).toContainText(FIRST_STAGE.title)
  await expect(page.locator('[data-testid="tour-narration"]')).toContainText(FIRST_STAGE.narration)

  // Timeline strip is mounted; the first cell (scoped to the compact strip)
  // carries data-current="true". The recap stage also renders an expanded
  // strip on the page itself, so we always scope to the compact strip
  // wrapper when asserting current-marker state.
  const compactStrip = page.locator('[data-testid="timeline-strip"]')
  const firstCell = compactStrip.locator(`[data-testid="timeline-cell-${FIRST_STAGE.id}"]`)
  await expect(firstCell).toHaveAttribute('data-current', 'true')

  await page.screenshot({ path: `e2e/screenshots/tour-stage-${FIRST_STAGE.ordinal}-${FIRST_STAGE.id}.png`, fullPage: true })

  // Walk through every remaining stage by clicking Next.
  for (let i = 1; i < STAGES.length; i++) {
    const expected = STAGES[i]
    await page.locator('[data-testid="tour-next"]').click()

    // Wait for the URL to update to the new stage's target route.
    await page.waitForURL((url) => url.pathname === expected.targetRoute, { timeout: 8000 })

    // Overlay reflects the new stage.
    await expect(page.locator('[data-testid="tour-stage-ordinal"]')).toContainText(
      `${expected.ordinal} / ${STAGES.length}`,
    )
    await expect(page.locator('[data-testid="tour-narration"]')).toContainText(expected.title)

    // Timeline strip's current marker has moved (compact strip only).
    await expect(
      compactStrip.locator(`[data-testid="timeline-cell-${expected.id}"]`),
    ).toHaveAttribute('data-current', 'true')

    await page.screenshot({ path: `e2e/screenshots/tour-stage-${expected.ordinal}-${expected.id}.png`, fullPage: true })
  }

  // At the last stage, Next is disabled.
  await expect(page.locator('[data-testid="tour-next"]')).toBeDisabled()

  // Exit ends the tour: overlay and strip detach from DOM.
  await page.locator('[data-testid="tour-exit"]').click()
  await expect(overlay).toBeHidden()
  await expect(page.locator('[data-testid="timeline-strip"]')).toBeHidden()
})

test('Deployment tour — timeline strip jump-to navigation moves directly to a non-adjacent stage', async ({ page }) => {
  await page.goto(`${FIRST_STAGE.targetRoute}?tour=deploy&stage=${FIRST_STAGE.id}`)

  // Jump to the consumption stage (stage 7) from stage 1.
  const compactStrip = page.locator('[data-testid="timeline-strip"]')
  const consumption = STAGE_BY_ID['consumption']
  await compactStrip.locator(`[data-testid="timeline-cell-${consumption.id}"]`).click()

  await page.waitForURL((url) => url.pathname === consumption.targetRoute, { timeout: 8000 })

  await expect(page.locator('[data-testid="tour-stage-ordinal"]')).toContainText(
    `${consumption.ordinal} / ${STAGES.length}`,
  )
  await expect(page.locator('[data-testid="tour-narration"]')).toContainText(consumption.title)
  await expect(
    compactStrip.locator(`[data-testid="timeline-cell-${consumption.id}"]`),
  ).toHaveAttribute('data-current', 'true')
})

test('Deployment tour — Back-to-tour chip appears when operator navigates off the stage route', async ({ page }) => {
  await page.goto(`${FIRST_STAGE.targetRoute}?tour=deploy&stage=${FIRST_STAGE.id}`)

  // Navigate off the tour stage route to a non-tour page.
  await page.goto('/pipeline?tour=deploy&stage=aod-scan')

  // Back-to-tour chip is now visible.
  const chip = page.locator('[data-testid="tour-back-to-tour"]')
  await expect(chip).toHaveText('← Back to tour stage')

  // Click it; we should return to the stage's target route.
  await chip.click()
  await page.waitForURL((url) => url.pathname === FIRST_STAGE.targetRoute, { timeout: 8000 })
  // Chip disappears once we're back on the stage route.
  await expect(chip).toBeHidden()
})

test('Deployment tour — closing stage routes to /tour/recap and renders the expanded timeline + recap stats', async ({ page }) => {
  await page.goto(`${LAST_STAGE.targetRoute}?tour=deploy&stage=${LAST_STAGE.id}`)

  await expect(page.locator('[data-testid="tour-stage-ordinal"]')).toContainText(
    `${LAST_STAGE.ordinal} / ${STAGES.length}`,
  )
  await expect(page.locator('[data-testid="timeline-strip-expanded"]')).toHaveAttribute(
    'aria-label',
    'Deployment tour timeline',
  )
  // Recap stats render exact values from the seed company profile.
  await expect(page.locator('[data-testid="recap-summary"]')).toContainText('47')
  await expect(page.locator('[data-testid="recap-summary"]')).toContainText('Day 15')
  await page.screenshot({ path: `e2e/screenshots/tour-recap-final.png`, fullPage: true })
})
