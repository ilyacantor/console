/**
 * TourOverlay — top-of-viewport bar mounted globally; renders only when a
 * tour stage is active. Shows ordinal, day range, narration, and the
 * advance/back/exit controls.
 *
 * If the operator navigates away from the active stage's targetRoute, a
 * "Back to tour" chip appears in the center; clicking it re-routes.
 */

import { useLocation, useNavigate } from 'react-router-dom'
import { useTour } from '../context/TourContext'
import { STAGES } from '../demo/seed'

export default function TourOverlay() {
  const { isActive, activeStage, advance, back, exitTour } = useTour()
  const location = useLocation()
  const navigate = useNavigate()

  if (!isActive || !activeStage) return null

  const onStageRoute = location.pathname === activeStage.targetRoute
  const isFirst = activeStage.ordinal === 1
  const isLast = activeStage.ordinal === STAGES.length

  return (
    <div
      data-testid="tour-overlay"
      role="region"
      aria-label="Deployment tour overlay"
      style={{
        position: 'fixed',
        top: '49px',
        left: 0,
        right: 0,
        height: '72px',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '0 16px',
        background: 'var(--bg-surface)',
        borderBottom: '0.5px solid var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
      }}
    >
      <div
        data-testid="tour-stage-ordinal"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minWidth: '140px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#0BCAD9',
            background: 'rgba(11,202,217,0.12)',
            padding: '3px 8px',
            borderRadius: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {activeStage.dayRange}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          {activeStage.ordinal} / {STAGES.length}
        </span>
      </div>

      <div
        data-testid="tour-narration"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: '13px',
          color: 'var(--text-primary)',
          lineHeight: 1.35,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px' }}>
          {activeStage.title}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          {activeStage.narration}
        </div>
      </div>

      {!onStageRoute && (
        <button
          data-testid="tour-back-to-tour"
          onClick={() => navigate(activeStage.targetRoute)}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            background: 'rgba(11,202,217,0.16)',
            color: '#0BCAD9',
            border: '0.5px solid rgba(11,202,217,0.35)',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          ← Back to tour stage
        </button>
      )}

      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button
          data-testid="tour-back"
          onClick={back}
          disabled={isFirst}
          style={btnSecondary(isFirst)}
          aria-label="Previous stage"
        >
          ← Back
        </button>
        <button
          data-testid="tour-next"
          onClick={advance}
          disabled={isLast}
          style={btnPrimary(isLast)}
          aria-label="Next stage"
        >
          {isLast ? activeStage.advanceLabel : activeStage.advanceLabel}
        </button>
        <button
          data-testid="tour-exit"
          onClick={exitTour}
          style={btnGhost()}
          aria-label="Exit tour"
        >
          Exit
        </button>
      </div>
    </div>
  )
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 600,
    background: disabled ? 'rgba(11,202,217,0.18)' : '#0BCAD9',
    color: disabled ? 'rgba(255,255,255,0.4)' : '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: disabled ? 'default' : 'pointer',
  }
}

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontSize: '12px',
    background: 'transparent',
    color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
    border: '0.5px solid var(--border)',
    borderRadius: '6px',
    cursor: disabled ? 'default' : 'pointer',
  }
}

function btnGhost(): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: '12px',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: 'none',
    cursor: 'pointer',
  }
}
