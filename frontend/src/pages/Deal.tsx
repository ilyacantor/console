import { useCallback, useMemo, useState } from 'react'
import {
  type Conflict,
  type CombiningRow,
  type Deliverable,
  type Gate,
  type StatementStatus,
  SEED_CONFLICTS,
  SEED_COMBINING_PNL,
  SEED_COMBINING_STATUS,
  SEED_DELIVERABLES,
  SEED_GATES,
  recomputeDeliverables,
  recomputeCombiningStatus,
} from '../data/deal-seed'

const LIFECYCLE_STAGES = ['upload', 'map', 'review', 'combine', 'deliver'] as const
const STAGE_LABELS: Record<string, string> = {
  upload: 'Upload',
  map: 'Map',
  review: 'Review',
  combine: 'Combine',
  deliver: 'Deliver',
}

const SEVERITY_COLORS = { high: '#EF4444', medium: '#F59E0B', low: '#6B7280' }
const STATUS_BAR_COLORS = { green: '#22C55E', amber: '#F59E0B', gray: '#555' }
const GATE_COLORS = { pass: '#22C55E', pending: '#F59E0B', fail: '#EF4444' }
const GATE_BG = { pass: '#14332A', pending: '#332B15', fail: '#2A1515' }

function formatDollars(n: number): string {
  const sign = n < 0 ? '(' : ''
  const close = n < 0 ? ')' : ''
  const abs = Math.abs(n).toLocaleString()
  return `${sign}${abs}${close}`
}

export default function Deal() {
  const [conflicts, setConflicts] = useState<Conflict[]>(() =>
    [...SEED_CONFLICTS].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1)),
  )
  const [deliverables, setDeliverables] = useState<Deliverable[]>(SEED_DELIVERABLES)
  const [combiningStatus, setCombiningStatus] = useState<StatementStatus[]>(SEED_COMBINING_STATUS)
  const [gates, setGates] = useState<Gate[]>(SEED_GATES)
  const currentStage = 'review'

  const pendingConflicts = useMemo(() => conflicts.filter((c) => c.status === 'pending'), [conflicts])
  const pendingImpact = useMemo(
    () => pendingConflicts.reduce((sum, c) => sum + c.impact_dollars, 0),
    [pendingConflicts],
  )
  const readyDeliverables = useMemo(() => deliverables.filter((d) => d.status === 'ready').length, [deliverables])

  const resolveConflict = useCallback(
    (id: string) => {
      const updated = conflicts.map((c) =>
        c.id === id ? { ...c, status: 'resolved' as const, treatment: 'Acq. treatment' } : c,
      )
      const sorted = [...updated].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1))
      setConflicts(sorted)
      setDeliverables(recomputeDeliverables(sorted, deliverables))
      setCombiningStatus(recomputeCombiningStatus(sorted, combiningStatus))
      if (sorted.every((c) => c.status === 'resolved')) {
        setGates((g) => g.map((gt) => (gt.label === 'Cash continuity' ? { ...gt, status: 'pass' as const } : gt)))
      }
    },
    [conflicts, deliverables, combiningStatus],
  )

  const batchApprove = useCallback(() => {
    const updated = conflicts.map((c) =>
      c.status === 'pending' ? { ...c, status: 'resolved' as const, treatment: 'Acq. treatment' } : c,
    )
    setConflicts(updated)
    setDeliverables(recomputeDeliverables(updated, deliverables))
    setCombiningStatus(recomputeCombiningStatus(updated, combiningStatus))
    setGates((g) => g.map((gt) => ({ ...gt, status: 'pass' as const })))
  }, [conflicts, deliverables, combiningStatus])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Lifecycle strip */}
      <LifecycleStrip currentStage={currentStage} />

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        <MetricCard
          label="COFA mapping"
          value="100%"
          sub={`${conflicts.length} accounts • 0 orphans`}
          valueColor="#22C55E"
        />
        <MetricCard
          label="Conflicts pending"
          value={String(pendingConflicts.length)}
          sub={`of ${conflicts.length} total, $${Math.round(pendingImpact / 1_000_000)}M impact`}
          valueColor={pendingConflicts.length > 0 ? '#EF4444' : '#22C55E'}
        />
        <MetricCard label="Deliverables ready" value={`${readyDeliverables} / 10`} sub="" />
        <MetricCard label="Engagement cost" value="$14.20" sub="9 runs • 47K tokens" />
      </div>

      {/* Two-column: Conflict register + Deliverables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <ConflictRegister
          conflicts={conflicts}
          pendingCount={pendingConflicts.length}
          onResolve={resolveConflict}
          onBatchApprove={batchApprove}
        />
        <DeliverablesTable deliverables={deliverables} readyCount={readyDeliverables} />
      </div>

      {/* Two-column: Combining P&L + Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <CombiningPnl rows={SEED_COMBINING_PNL} conflicts={conflicts} />
        <CombiningStatusPanel statuses={combiningStatus} gates={gates} />
      </div>
    </div>
  )
}

/* --- Lifecycle strip --- */

function LifecycleStrip({ currentStage }: { currentStage: string }) {
  const idx = LIFECYCLE_STAGES.indexOf(currentStage as (typeof LIFECYCLE_STAGES)[number])

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '0.5px solid var(--border)',
        borderRadius: '12px',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
        {LIFECYCLE_STAGES.map((stage, i) => {
          const color = i < idx ? '#22C55E' : i === idx ? '#3B82F6' : '#555'
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: i === idx ? 600 : 400,
                    color: i === idx ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {STAGE_LABELS[stage]}
                </span>
              </div>
              {i < LIFECYCLE_STAGES.length - 1 && (
                <span
                  style={{
                    width: '40px',
                    height: '0',
                    borderTop: '1.5px dashed var(--border)',
                    margin: '0 8px',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        Meridian Partners + Cascadia Process Solutions
      </span>
    </div>
  )
}

/* --- Metric card --- */

function MetricCard({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string
  value: string
  sub: string
  valueColor?: string
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '0.5px solid var(--border)',
        borderRadius: '12px',
        padding: '12px',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 600, color: valueColor ?? 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

/* --- Conflict register --- */

function ConflictRegister({
  conflicts,
  pendingCount,
  onResolve,
  onBatchApprove,
}: {
  conflicts: Conflict[]
  pendingCount: number
  onResolve: (id: string) => void
  onBatchApprove: () => void
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>Conflict register</h2>
        <span
          style={{
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '8px',
            background: pendingCount > 0 ? '#332B15' : '#14332A',
            color: pendingCount > 0 ? '#F59E0B' : '#4ADE80',
            fontWeight: 600,
          }}
        >
          {pendingCount} pending
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thLeft}>Conflict</th>
            <th style={thRight}>Impact</th>
            <th style={thCenter}>Status</th>
            <th style={thCenter}>Action</th>
          </tr>
        </thead>
        <tbody>
          {conflicts.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: SEVERITY_COLORS[c.severity],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                </div>
              </td>
              <td
                style={{
                  padding: '6px 8px',
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                }}
              >
                {c.impact_label}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                <StatusPill status={c.status} />
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                {c.status === 'pending' ? (
                  <button
                    onClick={() => onResolve(c.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#3B82F6',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      padding: '2px 6px',
                    }}
                  >
                    Resolve
                  </button>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.treatment}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pendingCount > 0 && (
        <div style={{ marginTop: '10px', textAlign: 'right' }}>
          <button
            onClick={onBatchApprove}
            style={{
              background: 'none',
              border: '0.5px solid var(--border)',
              color: '#3B82F6',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '4px 12px',
              borderRadius: '6px',
              fontWeight: 500,
            }}
          >
            Batch approve remaining
          </button>
        </div>
      )}
    </div>
  )
}

/* --- Deliverables table --- */

function DeliverablesTable({
  deliverables,
  readyCount,
}: {
  deliverables: Deliverable[]
  readyCount: number
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>Deliverables (§1.3.3)</h2>
        <span
          style={{
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '8px',
            background: '#14332A',
            color: '#4ADE80',
            fontWeight: 600,
          }}
        >
          {readyCount} ready
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ ...thCenter, width: '30px' }}></th>
            <th style={thLeft}>Deliverable</th>
            <th style={thCenter}>Status</th>
            <th style={thLeft}>Depends on</th>
          </tr>
        </thead>
        <tbody>
          {deliverables.map((d) => (
            <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                <DeliverableIcon status={d.status} />
              </td>
              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{d.name}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                <DeliverableStatusPill status={d.status} reason={d.block_reason} />
              </td>
              <td style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                {d.depends_on}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DeliverableIcon({ status }: { status: string }) {
  if (status === 'ready') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: '#14332A',
          color: '#4ADE80',
          fontSize: '10px',
          fontWeight: 700,
        }}
      >
        ✓
      </span>
    )
  }
  if (status === 'blocked') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: '#332B15',
          color: '#F59E0B',
          fontSize: '10px',
          fontWeight: 700,
        }}
      >
        !
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-block',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        border: '1.5px solid var(--border)',
      }}
    />
  )
}

function DeliverableStatusPill({ status, reason }: { status: string; reason: string | null }) {
  if (status === 'ready') {
    return (
      <span style={{ ...pillBase, background: '#14332A', color: '#4ADE80' }}>ready</span>
    )
  }
  if (status === 'blocked') {
    return (
      <span style={{ ...pillBase, background: '#332B15', color: '#F59E0B' }}>
        blocked{reason ? ` (${reason})` : ''}
      </span>
    )
  }
  return (
    <span style={{ ...pillBase, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>waiting</span>
  )
}

/* --- Combining P&L --- */

function CombiningPnl({ rows, conflicts }: { rows: CombiningRow[]; conflicts: Conflict[] }) {
  const pendingConflictIds = new Set(conflicts.filter((c) => c.status === 'pending').map((c) => c.id))

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>Combining P&L (preview)</h2>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>FY 2025, $M</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thLeft}></th>
            <th style={thRight}>Meridian</th>
            <th style={thRight}>Cascadia</th>
            <th style={thRight}>Adj.</th>
            <th style={thRight}>Combined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              style={{
                borderBottom: '1px solid var(--border)',
                borderTop: r.heavy_border_top ? '1.5px solid var(--text-muted)' : undefined,
              }}
            >
              <td
                style={{
                  padding: '6px 8px',
                  fontWeight: r.bold ? 600 : 400,
                }}
              >
                {r.label}
              </td>
              <td style={monoRight}>{formatDollars(r.meridian)}</td>
              <td style={monoRight}>{formatDollars(r.cascadia)}</td>
              <td style={monoRight}>
                {formatDollars(r.adjustment)}
                {r.cofa_link && pendingConflictIds.has(r.cofa_link) && (
                  <span
                    style={{
                      display: 'inline-block',
                      marginLeft: '6px',
                      fontSize: '9px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: '#332B15',
                      color: '#F59E0B',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                    title={`Linked to ${r.cofa_link}`}
                  >
                    {r.cofa_link}
                  </span>
                )}
              </td>
              <td style={{ ...monoRight, fontWeight: r.bold ? 600 : 400 }}>
                {formatDollars(r.combined)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>
        Adj. column updates live as conflicts are resolved. Gate links to conflict register.
      </div>
    </div>
  )
}

/* --- Combining status + hard gates --- */

function CombiningStatusPanel({
  statuses,
  gates,
}: {
  statuses: StatementStatus[]
  gates: Gate[]
}) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Combining status</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {statuses.map((s) => (
          <div key={s.label}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                marginBottom: '4px',
              }}
            >
              <span style={{ fontWeight: 500 }}>{s.label}</span>
              <span style={{ color: STATUS_BAR_COLORS[s.color] }}>{s.status_text}</span>
            </div>
            <div
              style={{
                height: '8px',
                background: 'var(--bg-hover)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${s.percent}%`,
                  background: STATUS_BAR_COLORS[s.color],
                  borderRadius: '4px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
          Hard gates
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {gates.map((g) => (
            <span
              key={g.label}
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '8px',
                background: GATE_BG[g.status],
                color: GATE_COLORS[g.status],
                fontWeight: 600,
              }}
            >
              {g.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* --- Status pill --- */

function StatusPill({ status }: { status: string }) {
  if (status === 'pending') {
    return <span style={{ ...pillBase, background: '#332B15', color: '#F59E0B' }}>pending</span>
  }
  return <span style={{ ...pillBase, background: '#14332A', color: '#4ADE80' }}>resolved</span>
}

/* --- Shared styles --- */

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '0.5px solid var(--border)',
  borderRadius: '12px',
  padding: '14px',
}

const pillBase: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '10px',
  padding: '2px 7px',
  borderRadius: '8px',
  fontWeight: 600,
}

const thLeft: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textAlign: 'left',
}

const thRight: React.CSSProperties = {
  ...thLeft,
  textAlign: 'right',
}

const thCenter: React.CSSProperties = {
  ...thLeft,
  textAlign: 'center',
}

const monoRight: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'right',
  fontFamily: 'monospace',
  fontSize: '11px',
}
