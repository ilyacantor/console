// Operator-visible outcome: /convergence page renders a Convergence Monitor heading, a Refresh button, an Open in Convergence deep-link pointing to port 3010, and one card per engagement from the Console API showing engagement short name or entity pair, lifecycle stage badge, and a View in Convergence deep-link
import { test, expect } from '@playwright/test'

test.describe('Convergence Monitor — read-only engagement view', () => {
  test('renders engagement cards with deep-links to Convergence', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    const apiResp = await page.request.get('/api/engagements')
    const apiData = await apiResp.json()
    const engagements = apiData.engagements || []

    await page.goto('/convergence')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: 'Convergence Monitor' }),
    ).toBeVisible({ timeout: 5000 })

    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible({ timeout: 3000 })

    const openLink = page.locator('[data-testid="open-convergence-link"]')
    await expect(openLink).toBeVisible({ timeout: 3000 })
    const openHref = await openLink.getAttribute('href')
    expect(openHref).toContain(':3010/engagements')

    if (engagements.length === 0) {
      await expect(
        page.getByText('No Convergence engagements found'),
      ).toBeVisible({ timeout: 3000 })
    } else {
      for (const eng of engagements) {
        const card = page.locator(
          `[data-testid="convergence-engagement-${eng.engagement_id}"]`,
        )
        await expect(card).toBeVisible({ timeout: 5000 })

        const cardText = await card.textContent()
        expect(cardText).toContain(eng.lifecycle_stage)

        const deepLink = page.locator(
          `[data-testid="deep-link-${eng.engagement_id}"]`,
        )
        const deepHref = await deepLink.getAttribute('href')
        expect(deepHref).toContain(`:3010/engagements/${eng.engagement_id}`)
      }
    }

    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::'),
    )
    expect(criticalErrors).toEqual([])
  })
})
