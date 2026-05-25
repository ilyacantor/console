/**
 * TimelineStrip — sticky bottom strip showing all 9 tour stages with day
 * ranges and a current-stage marker. Clicking a stage cell jumps the
 * tour to it.
 *
 * Renders only when a tour is active. In tour mode it sits beneath the
 * page content; the operator can click any stage to jump.
 *
 * Reused by TourRecap in expanded form (variant="expanded").
 */

import { useTour } from '../context/TourContext'
import { STAGES, type StageId } from '../demo/seed'

interface TimelineStripProps {
  variant?: 'compact' | 'expanded'
}

export default function TimelineStrip({ variant = 'compact' }: TimelineStripProps) {
  const { isActive, activeStageId, jumpTo } = useTour()

  // Compact strip only appears during an active tour. Expanded variant
  // (used inside TourRecap page) renders unconditionally.
  if (variant === 'compact' && !isActive) return null

  return (
    <div
      data-testid={variant === 'compact' ? 'timeline-strip' : 'timeline-strip-expanded'}
      role="navigation"
      aria-label="Deployment tour timeline"
      style={
        variant === 'compact'
          ? {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              height: '54px',
              zIndex: 40,
              display: 'flex',
              alignItems: 'stretch',
              background: 'var(--bg-surface)',
              borderTop: '0.5px solid var(--border)',
              padding: '6px 12px',
              gap: '4px',
              boxShadow: '0 -2px 12px rgba(0,0,0,0.18)',
            }
          : {
              display: 'flex',
              alignItems: 'stretch',
              padding: '14px',
              gap: '8px',
              border: '0.5px solid var(--border)',
              borderRadius: '12px',
              background: 'var(--bg-card)',
              minHeight: '110px',
            }
      }
    >
      {STAGES.map((stage) => (
        <TimelineCell
          key={stage.id}
          stageId={stage.id}
          ordinal={stage.ordinal}
          title={stage.title}
          dayRange={stage.dayRange}
          isCurrent={stage.id === activeStageId}
          variant={variant}
          onClick={() => jumpTo(stage.id)}
        />
      ))}
    </div>
  )
}

interface TimelineCellProps {
  stageId: StageId
  ordinal: number
  title: string
  dayRange: string
  isCurrent: boolean
  variant: 'compact' | 'expanded'
  onClick: () => void
}

function TimelineCell({
  stageId,
  ordinal,
  title,
  dayRange,
  isCurrent,
  variant,
  onClick,
}: TimelineCellProps) {
  const compact = variant === 'compact'
  return (
    <button
      data-testid={`timeline-cell-${stageId}`}
      data-current={isCurrent ? 'true' : 'false'}
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        textAlign: 'left',
        padding: compact ? '4px 8px' : '8px 12px',
        background: isCurrent ? 'rgba(11,202,217,0.18)' : 'transparent',
        border: isCurrent
          ? '0.5px solid rgba(11,202,217,0.45)'
          : '0.5px solid var(--border)',
        borderRadius: '6px',
        cursor: 'pointer',
        gap: '2px',
        overflow: 'hidden',
      }}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <span
        style={{
          fontSize: '10px',
          color: isCurrent ? '#0BCAD9' : 'var(--text-muted)',
          fontWeight: 700,
          letterSpacing: '0.04em',
        }}
      >
        {ordinal} · {dayRange}
      </span>
      <span
        style={{
          fontSize: compact ? '11px' : '12px',
          color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: isCurrent ? 600 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
        }}
      >
        {title}
      </span>
    </button>
  )
}
