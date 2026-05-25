/**
 * Synthetic Environment Preview — Stage 2 of the deployment tour.
 *
 * Shows the synthetic shadow of the customer's environment and one canned
 * NL question answered end-to-end with lineage. Numbers are synthetic;
 * the page surfaces that prominently.
 */

import { useEnvSnapshot } from '../hooks/useEnvSnapshot'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'
import { aodAppsAtStage, COMPANY, SYNTHETIC_SAMPLE } from '../demo/seed'

export default function SyntheticPreview() {
  const snapshot = useEnvSnapshot()
  const apps = snapshot ? aodAppsAtStage(snapshot) : []

  useSurfaceExtras('page:synthetic-preview', {
    visible_panels: ['Synthetic environment preview', 'Sample question answer'],
    extra: {
      page: 'synthetic-preview',
      synthetic_apps: apps.length,
      sample_question: SYNTHETIC_SAMPLE.question,
      data_source: 'farm-synthetic',
    },
  })

  return (
    <div style={{ padding: '16px 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>
          Synthetic Shadow Environment
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Same shape as {COMPANY.name}'s real environment. Synthetic data flowing,
          no real connections yet. Used to answer the first end-to-end question.
        </div>
      </div>

      {!snapshot && (
        <div
          data-testid="synthetic-empty-state"
          style={{
            border: '0.5px solid var(--border)',
            borderRadius: '10px',
            padding: '24px',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          No active synthetic environment. Start the deployment tour to see Crestline's shadow.
        </div>
      )}

      {snapshot && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Synthetic apps panel */}
          <div
            data-testid="synthetic-apps-panel"
            style={{
              border: '0.5px solid var(--border)',
              borderRadius: '10px',
              padding: '14px',
              background: 'var(--bg-card)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>
              {apps.length} synthetic apps
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
              Each real app discovered by AOD now has a synthetic shadow producing
              same-shape data via Farm.
            </div>
            <ul
              data-testid="synthetic-apps-list"
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                maxHeight: '320px',
                overflowY: 'auto',
                fontSize: '12px',
              }}
            >
              {apps.slice(0, 16).map((app) => (
                <li
                  key={app.app_id}
                  style={{
                    padding: '4px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{app.display_name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{app.category}</span>
                </li>
              ))}
            </ul>
            {apps.length > 16 && (
              <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 11 }}>
                + {apps.length - 16} more
              </div>
            )}
          </div>

          {/* Sample question answer */}
          <div
            data-testid="synthetic-question-panel"
            style={{
              border: '0.5px solid var(--border)',
              borderRadius: '10px',
              padding: '14px',
              background: 'var(--bg-card)',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#F59E0B',
                background: 'rgba(245,158,11,0.18)',
                padding: '3px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'inline-block',
                marginBottom: '8px',
              }}
              data-testid="synthetic-source-badge"
            >
              {SYNTHETIC_SAMPLE.source_label}
            </div>
            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>
              "{SYNTHETIC_SAMPLE.question}"
            </div>
            <div
              data-testid="synthetic-answer-summary"
              style={{
                fontSize: '13px',
                color: 'var(--text-primary)',
                marginBottom: '10px',
              }}
            >
              {SYNTHETIC_SAMPLE.answer_summary}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
              {SYNTHETIC_SAMPLE.rows.map((r) => (
                <div
                  key={r.label}
                  data-testid="synthetic-answer-row"
                  style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                  <span style={{ fontFamily: 'monospace' }}>{r.value}</span>
                </div>
              ))}
            </div>
            <div
              data-testid="synthetic-lineage"
              style={{
                paddingTop: 8,
                borderTop: '1px solid var(--border)',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              Lineage: {SYNTHETIC_SAMPLE.lineage_chain.join(' → ')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
