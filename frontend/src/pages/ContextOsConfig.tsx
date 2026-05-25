/**
 * contextOS — Stage 8 of the deployment tour. Placeholder configuration
 * surface showing the three panels (Relationships, Hierarchies, Rollups)
 * the customer team works in once the platform is queryable. Read-only;
 * no persistence; no real backend wired. Functional contextOS is a
 * separate product build.
 */

import { useSurfaceExtras } from '../context/SurfaceExtrasContext'
import { CONTEXTOS_PANELS } from '../demo/seed'

export default function ContextOsConfig() {
  useSurfaceExtras('page:contextos', {
    visible_panels: ['contextOS panels (placeholder)'],
    extra: {
      page: 'contextos',
      placeholder: true,
      panel_count: CONTEXTOS_PANELS.length,
    },
  })

  return (
    <div style={{ padding: '16px 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>
          contextOS — Business Model Configuration
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Customer team works here for 15+ days to define relationships, hierarchies, and rollups.
          Placeholder for the demo — full editor ships separately.
        </div>
      </div>

      <div
        data-testid="contextos-banner"
        style={{
          background: 'rgba(245,158,11,0.10)',
          border: '0.5px solid rgba(245,158,11,0.35)',
          color: '#F59E0B',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '12px',
        }}
      >
        Read-only preview. Editing, persistence, and validation come with the contextOS module.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {CONTEXTOS_PANELS.map((panel) => (
          <div
            key={panel.title}
            data-testid="contextos-panel"
            data-panel-title={panel.title}
            style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--border)',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '14px' }}>{panel.title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {panel.description}
            </div>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 12,
              }}
            >
              {panel.example_entries.map((entry) => (
                <li
                  key={entry}
                  style={{
                    padding: '6px 8px',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: 11,
                  }}
                >
                  {entry}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
