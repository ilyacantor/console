/**
 * Consumption — Stage 7 of the deployment tour. Merges "plug into
 * everything" (top) with "ask in plain English" (bottom: NLQ galaxy).
 *
 * Top: plug-in destinations panel (Tableau, Power BI, Looker, Snowflake-
 * as-source, Claude over MCP, etc.) from the seed.
 * Bottom: NLQ galaxy iframe via ?view=galaxy. The galaxy lives in NLQ
 * (port 3005); we just point the iframe URL at it. The canned answer
 * (top-5 advisors) lives in the seed and is shown as a sidecar panel
 * during a tour snapshot so a rep can read it without depending on NLQ.
 */

import ModuleIframe from '../components/ModuleIframe'
import { useEnvSnapshot } from '../hooks/useEnvSnapshot'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'
import { GALAXY_CANNED_ANSWER, PLUGIN_DESTINATIONS } from '../demo/seed'

const NLQ_BASE = import.meta.env.VITE_NLQ_URL || 'http://localhost:3005'

export default function Consumption() {
  const snapshot = useEnvSnapshot()

  useSurfaceExtras('page:consumption', {
    visible_panels: ['Plug-in destinations', 'NLQ galaxy iframe'],
    extra: {
      page: 'consumption',
      iframe_url: `${NLQ_BASE}?view=galaxy`,
      destinations_total: PLUGIN_DESTINATIONS.length,
      destinations_connected: PLUGIN_DESTINATIONS.filter((p) => p.status === 'connected').length,
    },
  })

  return (
    <div style={{ padding: '16px 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>
          Plug-in destinations · Ask in plain English
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          BI tools, Snowflake-as-source, agents over MCP, downstream systems —
          all reading from the AOS semantic layer. Galaxy below answers in plain English.
        </div>
      </div>

      {/* Plug-in destinations grid */}
      <div
        data-testid="plugins-panel"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px',
        }}
      >
        {PLUGIN_DESTINATIONS.map((p) => (
          <div
            key={p.display_name}
            data-testid="plugin-card"
            data-plugin-status={p.status}
            style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--border)',
              borderRadius: '10px',
              padding: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{p.display_name}</span>
              <StatusPill status={p.status} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              {p.category} · {p.vendor}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{p.note}</div>
          </div>
        ))}
      </div>

      {/* Galaxy + canned-answer sidecar */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, minHeight: 420 }}>
        <div
          data-testid="galaxy-iframe-wrapper"
          style={{
            border: '0.5px solid var(--border)',
            borderRadius: '10px',
            overflow: 'hidden',
            minHeight: 420,
          }}
        >
          <ModuleIframe
            serviceName="NLQ"
            baseUrl={`${NLQ_BASE}?view=galaxy`}
            title="NLQ Galaxy"
            entityParam={false}
            minHeight="420px"
            height="calc(100vh - 420px)"
          />
        </div>

        {snapshot && (
          <div
            data-testid="galaxy-canned-answer"
            style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--border)',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              overflow: 'auto',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '13px' }}>Sample question</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              "{GALAXY_CANNED_ANSWER.question}"
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <table
                data-testid="galaxy-answer-table"
                style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}
              >
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '4px 6px' }}>Advisor</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>AUM Q3</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Δ Q2</th>
                  </tr>
                </thead>
                <tbody>
                  {GALAXY_CANNED_ANSWER.rows.map((r) => (
                    <tr
                      key={r.advisor}
                      data-testid="galaxy-answer-row"
                      style={{ borderTop: '1px solid var(--border)' }}
                    >
                      <td style={{ padding: '4px 6px' }}>{r.advisor}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{r.aum_q3}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', color: r.delta_vs_q2.startsWith('-') ? '#FCA5A5' : '#86EFAC' }}>
                        {r.delta_vs_q2}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div data-testid="galaxy-answer-lineage" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>
                Lineage
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                {GALAXY_CANNED_ANSWER.lineage.map((l) => (
                  <li key={l} style={{ padding: '2px 0' }}>· {l}</li>
                ))}
              </ul>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>
                Related metrics
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                {GALAXY_CANNED_ANSWER.related.map((r) => (
                  <li key={r} style={{ padding: '2px 0' }}>· {r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: 'connected' | 'configured' | 'available' }) {
  const colors = {
    connected: { fg: '#22C55E', bg: 'rgba(34,197,94,0.18)' },
    configured: { fg: '#0BCAD9', bg: 'rgba(11,202,217,0.18)' },
    available: { fg: 'var(--text-muted)', bg: 'rgba(255,255,255,0.06)' },
  }[status]
  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 700,
        color: colors.fg,
        background: colors.bg,
        padding: '2px 6px',
        borderRadius: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {status}
    </span>
  )
}
