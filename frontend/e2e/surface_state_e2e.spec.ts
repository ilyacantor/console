import { expect, test } from '@playwright/test'

const BACKEND = process.env.CONSOLE_API_URL || 'http://localhost:8009'
const PLATFORM = process.env.PLATFORM_API_URL || 'http://localhost:8006'
const MCP_KEY = process.env.CONSOLE_MCP_API_KEY || 'console-mcp-key-v1'

// Per-route smoke: open each Console route, wait for the SurfaceStateSync
// push, then query Console MCP with the exact session_id the browser used
// and assert the snapshot carries the right route + at least one visible_panel.
const ROUTES: { path: string; expectedPanel: string | RegExp }[] = [
  { path: '/pipeline', expectedPanel: /pipeline steps|run history/ },
  { path: '/changes', expectedPanel: /events feed|severity/ },
  { path: '/dashboards', expectedPanel: /NLQ dashboards/ },
  { path: '/reports', expectedPanel: /Convergence reports/ },
  { path: '/operator-feed', expectedPanel: /plan cards|status filter|tier filter/ },
  { path: '/instrumentation', expectedPanel: /runs table|summary cards/ },
  { path: '/engagements', expectedPanel: /engagements table/ },
]

async function fetchSnapshot(sessionId: string) {
  const r = await fetch(`${BACKEND}/api/mcp/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'get_surface_state',
      arguments: { session_id: sessionId },
      api_key: MCP_KEY,
    }),
  })
  return r.json()
}

test.describe('Mai surface state per route', () => {
  for (const { path, expectedPanel } of ROUTES) {
    test(`pushes snapshot from ${path}`, async ({ page }) => {
      const pushes: { url: string; body: any }[] = []
      page.on('request', (req) => {
        if (req.url().includes('/api/mcp/surface-state') && req.method() === 'POST') {
          try {
            pushes.push({ url: req.url(), body: JSON.parse(req.postData() ?? '{}') })
          } catch {
            pushes.push({ url: req.url(), body: null })
          }
        }
      })

      await page.goto(path)
      // Let React settle and SurfaceStateSync's useEffect fire.
      await page.waitForTimeout(1500)

      const latest = pushes.filter((p) => p.body?.route === path).pop()
      expect(latest, `no POST with route=${path} seen`).toBeTruthy()
      const sessionId = latest!.body.session_id as string
      expect(sessionId).toMatch(/^float-\d+-[a-z0-9]+$/)

      const resp = await fetchSnapshot(sessionId)
      expect(resp.success, `tool call failed: ${resp.error}`).toBe(true)
      expect(resp.result.route).toBe(path)
      const panels = (resp.result.visible_panels ?? []).join(' | ')
      expect(panels, `no expected panel on ${path} — got: ${panels}`).toMatch(expectedPanel)
    })
  }

  test('/pipeline extras include step_statuses and run history', async ({ page }) => {
    const pushes: any[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/mcp/surface-state') && req.method() === 'POST') {
        try {
          pushes.push(JSON.parse(req.postData() ?? '{}'))
        } catch { /* ignore */ }
      }
    })
    await page.goto('/pipeline')
    await page.waitForTimeout(2000)
    const latest = pushes.filter((p) => p.route === '/pipeline').pop()
    expect(latest, 'no /pipeline push seen').toBeTruthy()
    const sessionId = latest.session_id as string

    const resp = await fetchSnapshot(sessionId)
    expect(resp.success).toBe(true)
    expect(resp.result.route).toBe('/pipeline')
    const extra = resp.result.extra ?? {}
    expect(extra.page).toBe('pipeline')
    expect(Array.isArray(extra.recent_runs)).toBe(true)
    expect(Array.isArray(extra.step_statuses)).toBe(true)
    // pipeline_mode is either 'se' or 'me' — never undefined
    expect(['se', 'me']).toContain(extra.pipeline_mode)
  })

  test('first-turn /pipeline SE: no engagement scope leakage', async ({ page }) => {
    // Architectural guard: SE pipeline mode publishes engagement_id=null to
    // ChatScopeContext, so MaiPanel sends NO engagement_id in the canonical
    // envelope. Assembler therefore loads NO engagement memory and NO Layer 3
    // policies. Mai's first turn cannot describe an "engagement" because none
    // is in scope. This is the architectural fix for the Meridian/Cascadia
    // hallucination on SE — no prompt-level "be careful" instructions, the
    // memory simply isn't loaded.
    const pushes: any[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/mcp/surface-state') && req.method() === 'POST') {
        try {
          pushes.push(JSON.parse(req.postData() ?? '{}'))
        } catch { /* ignore */ }
      }
    })

    // Fresh session_id forces a fresh Mai context (no prior turns to lean on).
    await page.addInitScript(() => {
      try { localStorage.removeItem('mai.session_id') } catch { /* ignore */ }
    })
    await page.goto('/pipeline')
    await page.waitForTimeout(1500)
    const latest = pushes.filter((p) => p.route === '/pipeline').pop()
    expect(latest, 'no /pipeline push seen').toBeTruthy()
    const sessionId = latest.session_id as string

    // Confirm the snapshot reflects SE mode (the default selection on /pipeline).
    expect(latest.extra?.pipeline_mode).toBe('se')
    expect(latest.extra?.me_engagement_id ?? null).toBeNull()

    const resp = await fetch(`${PLATFORM}/api/mai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'what pipeline mode am I currently viewing?',
        session_id: sessionId,
        surface_id: 'console',
        tenant_id: '69688df3-fc8e-51f8-a77c-9c13f9b3a784',
        operator_id: 'ilya',
        page_context: { route: '/pipeline', current_page: 'pipeline' },
        // Critical: no engagement_id in envelope. This is what the Console
        // produces when on /pipeline SE mode after the ChatScopeContext fix.
      }),
    })
    const text = await resp.text()
    const lower = text.toLowerCase()

    // Tool result must reflect the snapshot (route + extras present).
    expect(text).toContain('"route": "/pipeline"')
    expect(text).toContain('"pipeline_mode": "se"')

    // Final answer must identify SE mode (snapshot ground truth).
    expect(lower).toMatch(/\bse\b|single[- ]entity/)

    // First-turn hallucination guard: Mai must NOT claim there's an active
    // M&A engagement. These phrases were the exact bug. Recent_runs may name
    // historic engagements, but Mai must not assert the operator is "currently
    // viewing" or "in" an engagement when none is in scope.
    const banned = [
      /currently viewing the [^.]*engagement/i,
      /you(?:'re| are) (?:currently )?(?:in|viewing|on) the [^.]*\bengagement\b/i,
      /meridian\s*(?:→|->|to)\s*cascadia\s+engagement/i,
      /active engagement[: ]+meridian/i,
      /active engagement[: ]+cascadia/i,
    ]
    for (const pat of banned) {
      expect(text, `hallucinated engagement context matched ${pat}`).not.toMatch(pat)
    }
  })

  test('Mai chat on /pipeline returns route + extras (no "no snapshot" note)', async ({ page }) => {
    const pushes: any[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/mcp/surface-state') && req.method() === 'POST') {
        try {
          pushes.push(JSON.parse(req.postData() ?? '{}'))
        } catch { /* ignore */ }
      }
    })
    await page.goto('/pipeline')
    await page.waitForTimeout(1500)
    const latest = pushes.filter((p) => p.route === '/pipeline').pop()
    expect(latest).toBeTruthy()
    const sessionId = latest.session_id as string

    // Hit Mai directly with the browser's session_id so we verify the exact
    // integration the operator triggers when asking "what do you see?".
    const resp = await fetch(`${PLATFORM}/api/mai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'what do you see on this page?',
        session_id: sessionId,
        surface_id: 'console',
        tenant_id: '69688df3-fc8e-51f8-a77c-9c13f9b3a784',
        operator_id: 'ilya',
        page_context: { route: '/pipeline', current_page: 'pipeline' },
      }),
    })
    const text = await resp.text()
    // Tool result must carry the real route, not the "no snapshot" note
    expect(text).toContain('"route": "/pipeline"')
    expect(text).not.toContain('"note": "No snapshot pushed yet')
    // Final content must reference pipeline, not be generic.
    expect(text.toLowerCase()).toContain('pipeline')
  })
})
