// Operator-visible outcome: operator opens /deploy/credentials at the credentials stage of the tour and sees the validated count match the seed's credentialsAtStage('credentials') value (47 minus the two retirement-blocked apps), the Edge Agent install command panel containing "TENANT=crestline" and "OUTBOUND=...:443", an outbound tunnel SVG diagram with "outbound only" text, and a row for the Replit-hosted Advisor Calculator marked status="blocked".

import { test, expect } from '@playwright/test'
import { credentialsAtStage } from '../src/demo/seed'

test('Credentials — checklist + Edge Agent install + tunnel diagram render seed-driven progression', async ({ page }) => {
  await page.goto('/deploy/credentials?tour=deploy&stage=credentials')

  const seedCounts = credentialsAtStage('credentials')

  await expect(page.locator('[data-testid="cred-stat-validated"]')).toContainText(String(seedCounts.validated))
  await expect(page.locator('[data-testid="cred-stat-blocked"]')).toContainText(String(seedCounts.blocked))
  await expect(page.locator('[data-testid="cred-stat-total"]')).toContainText(String(seedCounts.total))

  // Edge install command shows the expected tenant + outbound URL.
  await expect(page.locator('[data-testid="edge-install-command"]')).toContainText('TENANT=crestline')
  await expect(page.locator('[data-testid="edge-install-command"]')).toContainText(':443')

  // Tunnel diagram has the outbound-only label.
  await expect(page.locator('[data-testid="tunnel-diagram"]')).toContainText('outbound only')

  // Replit calculator app row is blocked.
  const replRow = page.locator('[data-testid="credential-row"][data-app-id="repl"]')
  await expect(replRow).toHaveAttribute('data-status', 'blocked')

  await page.screenshot({ path: 'e2e/screenshots/credentials-tour.png', fullPage: true })
})

test('Credentials — fabric-stage snapshot advances validated count past the credentials stage value', async ({ page }) => {
  await page.goto('/deploy/credentials?tour=deploy&stage=fabric-discovery')

  const credsAtFabric = credentialsAtStage('fabric-discovery')
  const credsAtCreds = credentialsAtStage('credentials')

  // At the fabric stage the Charles River + Power BI + shadow credentials
  // come in (4 more validated), so this number is strictly larger than at
  // the prior stage.
  expect(credsAtFabric.validated).toBeGreaterThan(credsAtCreds.validated)

  await expect(page.locator('[data-testid="cred-stat-validated"]')).toContainText(String(credsAtFabric.validated))
})
