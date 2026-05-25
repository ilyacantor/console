/**
 * AOD Inventory — Stage 1 of the deployment tour.
 *
 * Renders the live-populating table of discovered apps with governance tag
 * and SOR score. When a tour snapshot is active, the table is populated
 * from the Crestline seed. With no snapshot, the page renders the empty
 * state — there is no live AOD inventory endpoint yet (flagged as a
 * follow-up in dcl_deferred_work.md / console_deferred_work.md).
 */

import { useEnvSnapshot } from '../hooks/useEnvSnapshot'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'
import { aodAppsAtStage, type AodApp, type Governance } from '../demo/seed'

export default function AodInventory() {
  const snapshot = useEnvSnapshot()
  const apps: AodApp[] = snapshot ? aodAppsAtStage(snapshot) : []

  const sorCount = apps.filter((a) => a.is_sor).length
  const shadowCount = apps.filter((a) => a.governance === 'shadow' || a.governance === 'unmanaged').length

  useSurfaceExtras('page:aod-inventory', {
    visible_panels: ['AOD inventory table'],
    extra: {
      page: 'aod-inventory',
      apps_discovered: apps.length,
      sors_tagged: sorCount,
      shadow_apps: shadowCount,
    },
  })

  return (
    <div style={{ padding: '16px 4px' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>
        AOD Discovery — Live Inventory
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
        Apps appear as AOD discovers them. Governance tag + SOR score on each row.
      </div>

      {!snapshot && (
        <div
          data-testid="aod-empty-state"
          style={{
            border: '0.5px solid var(--border)',
            borderRadius: '10px',
            padding: '24px',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          No active AOD discovery run. Start the deployment tour (<code>?tour=deploy</code>)
          to see the Crestline example.
        </div>
      )}

      {snapshot && (
        <>
          <div
            data-testid="aod-summary"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              marginBottom: '14px',
            }}
          >
            <SummaryCard label="Apps discovered" value={String(apps.length)} />
            <SummaryCard label="Systems of record" value={String(sorCount)} />
            <SummaryCard label="Shadow / unmanaged" value={String(shadowCount)} />
          </div>

          <div style={{ border: '0.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <table
              data-testid="aod-table"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}
            >
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                  <th style={cellHeaderStyle}>App</th>
                  <th style={cellHeaderStyle}>Vendor</th>
                  <th style={cellHeaderStyle}>Category</th>
                  <th style={cellHeaderStyle}>Governance</th>
                  <th style={{ ...cellHeaderStyle, textAlign: 'right' }}>SOR Score</th>
                  <th style={cellHeaderStyle}>SOR</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr
                    key={app.app_id}
                    data-testid="aod-row"
                    data-app-id={app.app_id}
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <td style={cellStyle}>{app.display_name}</td>
                    <td style={cellStyle}>{app.vendor}</td>
                    <td style={cellStyle}>{app.category}</td>
                    <td style={cellStyle}>
                      <GovernancePill governance={app.governance} />
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                      {app.sor_score.toFixed(2)}
                    </td>
                    <td style={cellStyle}>
                      {app.is_sor && (
                        <span
                          data-testid="sor-badge"
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#22C55E',
                            background: 'rgba(34,197,94,0.16)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          SOR
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            data-testid="aod-count"
            style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '12px' }}
          >
            {apps.length} apps discovered
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '0.5px solid var(--border)',
        borderRadius: '10px',
        padding: '12px',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function GovernancePill({ governance }: { governance: Governance }) {
  const colors = {
    managed: { bg: 'rgba(34,197,94,0.16)', fg: '#22C55E' },
    shadow: { bg: 'rgba(245,158,11,0.22)', fg: '#F59E0B' },
    unmanaged: { bg: 'rgba(239,68,68,0.22)', fg: '#EF4444' },
  }[governance]
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 600,
        color: colors.fg,
        background: colors.bg,
        padding: '2px 8px',
        borderRadius: '10px',
      }}
    >
      {governance}
    </span>
  )
}

const cellHeaderStyle: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  padding: '8px 12px',
}

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
}
