import { useCallback, useEffect, useState } from 'react'
import HealthStrip from '../components/HealthStrip'
import {
  fetchHealth,
  fetchRuns,
  fetchBaselines,
  updateBaselines,
  runPipeline,
  resetPipeline,
  type HealthResponse,
  type PipelineRun,
  type PipelineStep,
  type Baselines,
} from '../api/client'
import { useEntity } from '../context/EntityContext'

// Step name → baseline key mapping
const BASELINE_KEYS: Record<string, string> = {
  farm_gen: 'farm_gen',
  dcl_verify: 'dcl_verify',
  cofa_unification: 'cofa_unification',
}

const STATUS_ICON: Record<string, string> = {
  success: '\u2713',
  failed: '\u2717',
  running: '\u25CB',
  pending: '\u25CB',
}

const STATUS_COLOR: Record<string, string> = {
  success: '#22C55E',
  failed: '#EF4444',
  running: '#F59E0B',
  pending: '#999',
}

function formatDuration(s: number | null): string {
  if (s == null) return '—'
  return `${s.toFixed(1)}s`
}

function formatTriples(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

function deltaPercent(actual: number | null, baseline: number | null): { text: string; color: string } {
  if (actual == null || baseline == null || baseline === 0) return { text: '—', color: '#999' }
  const pct = ((actual - baseline) / baseline) * 100
  const color = pct <= 0 ? '#22C55E' : pct <= 10 ? '#F59E0B' : '#EF4444'
  const sign = pct > 0 ? '+' : ''
  return { text: `${sign}${pct.toFixed(0)}%`, color }
}

function progressBarWidth(actual: number | null, baseline: number | null): number {
  if (actual == null || baseline == null || baseline === 0) return 0
  return Math.min((actual / baseline) * 100, 150)
}

function progressBarColor(actual: number | null, baseline: number | null): string {
  if (actual == null || baseline == null || baseline === 0) return '#E0E0E0'
  return actual <= baseline ? '#3B82F6' : '#EF4444'
}

export default function Pipeline() {
  const { entities, selected } = useEntity()
  const [mode, setMode] = useState<'SE' | 'ME'>('SE')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [currentRun, setCurrentRun] = useState<PipelineRun | null>(null)
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [baselines, setBaselines] = useState<Baselines>({})
  const [running, setRunning] = useState(false)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load health
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await fetchHealth()
        if (!cancelled) setHealth(data)
      } catch { /* non-critical */ }
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Load runs and baselines
  const loadRuns = useCallback(async () => {
    try {
      const data = await fetchRuns(10)
      setRuns(data.runs)
      if (data.runs.length > 0 && !currentRun) {
        setCurrentRun(data.runs[0]!)
      }
    } catch { /* non-critical */ }
  }, [currentRun])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchBaselines()
        setBaselines(data.baselines)
      } catch { /* non-critical */ }
    }
    load()
  }, [])

  const handleRun = async () => {
    setRunning(true)
    setError(null)
    try {
      const entityIds = mode === 'ME'
        ? entities.map(e => e.id)
        : selected
          ? [selected]
          : [entities[0]!.id]

      const result = await runPipeline(mode, entityIds)
      setCurrentRun(result)
      await loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const handleReset = async () => {
    setError(null)
    try {
      await resetPipeline()
      setCurrentRun(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleBaselineChange = async (key: string, value: number) => {
    const updated = { ...baselines, [key]: value }
    setBaselines(updated)
    try {
      await updateBaselines(updated)
    } catch { /* best-effort persist */ }
  }

  const displaySteps = currentRun?.steps ?? []
  const isStale = currentRun && currentRun.status !== 'running'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '16px', fontWeight: 600 }}>Pipeline</h1>
        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex" style={{ gap: '2px' }}>
            {(['SE', 'ME'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  fontSize: '12px',
                  padding: '5px 14px',
                  border: '0.5px solid #E0E0E0',
                  borderRadius: '8px',
                  background: mode === m ? '#3B82F6' : '#fff',
                  color: mode === m ? '#fff' : '#333',
                  cursor: 'pointer',
                  fontWeight: mode === m ? 600 : 400,
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            onClick={handleRun}
            disabled={running}
            style={{
              fontSize: '12px',
              padding: '5px 14px',
              border: '0.5px solid #3B82F6',
              borderRadius: '8px',
              background: '#3B82F6',
              color: '#fff',
              cursor: running ? 'not-allowed' : 'pointer',
              opacity: running ? 0.6 : 1,
            }}
          >
            {running ? 'Running...' : 'Run'}
          </button>

          <button
            onClick={handleReset}
            style={{
              fontSize: '12px',
              padding: '5px 14px',
              border: 'none',
              borderRadius: '8px',
              background: 'transparent',
              color: '#EF4444',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#FEF2F2',
            border: '0.5px solid #EF4444',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#991B1B',
            marginBottom: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Health strip */}
      {health && (
        <div style={{ marginBottom: '14px' }}>
          <HealthStrip services={health.services} />
        </div>
      )}

      {/* Merged run + baseline table */}
      <div
        style={{
          background: '#fff',
          border: '0.5px solid #E0E0E0',
          borderRadius: '12px',
          padding: '14px',
          marginBottom: '14px',
          opacity: isStale ? 0.7 : 1,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #F0F0F0' }}>
              <th style={thStyle}></th>
              <th style={{ ...thStyle, textAlign: 'left' }}>Step</th>
              <th style={thStyle}>Duration</th>
              <th style={thStyle}>Triples</th>
              <th style={{ ...thStyle, width: '120px' }}>Progress</th>
              <th style={thStyle}>Baseline</th>
              <th style={thStyle}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {displaySteps.map((step) => {
              const bKey = BASELINE_KEYS[step.name]
              const baseline = bKey ? baselines[bKey] ?? null : null
              const delta = deltaPercent(step.duration_s, baseline)
              const barW = progressBarWidth(step.duration_s, baseline)
              const barColor = progressBarColor(step.duration_s, baseline)

              return (
                <tr key={step.name} style={{ borderBottom: '1px solid #F8F8F8' }}>
                  <td style={{ ...tdStyle, width: '24px', textAlign: 'center' }}>
                    <span style={{ color: STATUS_COLOR[step.status] ?? '#999' }}>
                      {STATUS_ICON[step.status] ?? '?'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 500 }}>
                    {step.display_name}
                    {step.error && (
                      <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '2px' }}>
                        {step.error}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{formatDuration(step.duration_s)}</td>
                  <td style={tdStyle}>{formatTriples(step.triples)}</td>
                  <td style={tdStyle}>
                    <div
                      style={{
                        height: '6px',
                        background: '#F0F0F0',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(barW, 100)}%`,
                          background: barColor,
                          borderRadius: '3px',
                        }}
                      />
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {bKey != null ? (
                      <input
                        type="number"
                        value={baseline ?? ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value)
                          if (!isNaN(v) && bKey) handleBaselineChange(bKey, v)
                        }}
                        style={{
                          width: '50px',
                          fontSize: '11px',
                          padding: '2px 4px',
                          border: '0.5px solid #E0E0E0',
                          borderRadius: '4px',
                          textAlign: 'center',
                        }}
                      />
                    ) : '—'}
                  </td>
                  <td style={{ ...tdStyle, color: delta.color, fontWeight: 500 }}>
                    {delta.text}
                  </td>
                </tr>
              )
            })}
            {/* Total row */}
            {currentRun && (
              <tr style={{ borderTop: '2px solid #E0E0E0' }}>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700 }}>Total</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>
                  {formatDuration(currentRun.total_duration_s)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>
                  {formatTriples(currentRun.total_triples)}
                </td>
                <td style={tdStyle}>
                  {(() => {
                    const totalKey = mode === 'SE' ? 'total_se' : 'total_me'
                    const tb = baselines[totalKey] ?? null
                    const barW = progressBarWidth(currentRun.total_duration_s, tb)
                    const barColor = progressBarColor(currentRun.total_duration_s, tb)
                    return (
                      <div
                        style={{
                          height: '6px',
                          background: '#F0F0F0',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(barW, 100)}%`,
                            background: barColor,
                            borderRadius: '3px',
                          }}
                        />
                      </div>
                    )
                  })()}
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={baselines[mode === 'SE' ? 'total_se' : 'total_me'] ?? ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      const key = mode === 'SE' ? 'total_se' : 'total_me'
                      if (!isNaN(v)) handleBaselineChange(key, v)
                    }}
                    style={{
                      width: '50px',
                      fontSize: '11px',
                      padding: '2px 4px',
                      border: '0.5px solid #E0E0E0',
                      borderRadius: '4px',
                      textAlign: 'center',
                    }}
                  />
                </td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  {(() => {
                    const totalKey = mode === 'SE' ? 'total_se' : 'total_me'
                    const d = deltaPercent(currentRun.total_duration_s, baselines[totalKey] ?? null)
                    return <span style={{ color: d.color }}>{d.text}</span>
                  })()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {displaySteps.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: '20px', fontSize: '12px' }}>
            No pipeline run yet. Click Run to start.
          </div>
        )}
      </div>

      {/* Run history */}
      <div
        style={{
          background: '#fff',
          border: '0.5px solid #E0E0E0',
          borderRadius: '12px',
          padding: '14px',
        }}
      >
        <h2 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
          Run History
        </h2>
        {runs.length === 0 ? (
          <div style={{ color: '#999', fontSize: '12px' }}>No runs yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F0F0F0' }}>
                <th style={{ ...thStyle, textAlign: 'left' }}>Run ID</th>
                <th style={thStyle}>Mode</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Triples</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <RunRow
                  key={run.run_id}
                  run={run}
                  expanded={expandedRun === run.run_id}
                  onToggle={() =>
                    setExpandedRun(expandedRun === run.run_id ? null : run.run_id)
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: PipelineRun
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ borderBottom: '1px solid #F8F8F8', cursor: 'pointer' }}
      >
        <td style={{ ...tdStyle, textAlign: 'left', fontFamily: 'monospace', fontSize: '11px' }}>
          {run.run_id.slice(0, 8)}
        </td>
        <td style={tdStyle}>
          <span
            style={{
              display: 'inline-block',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
              background: run.mode === 'ME' ? '#F3E8FF' : '#DBEAFE',
              color: run.mode === 'ME' ? '#7C3AED' : '#3B82F6',
            }}
          >
            {run.mode}
          </span>
          {run.entity_ids.map((e) => (
            <span
              key={e}
              style={{
                display: 'inline-block',
                padding: '1px 4px',
                marginLeft: '4px',
                borderRadius: '3px',
                fontSize: '10px',
                background: '#F5F5F0',
                color: '#666',
              }}
            >
              {e}
            </span>
          ))}
        </td>
        <td style={tdStyle}>{formatDuration(run.total_duration_s)}</td>
        <td style={tdStyle}>{formatTriples(run.total_triples)}</td>
        <td style={tdStyle}>
          <span
            style={{
              display: 'inline-block',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
              background: run.status === 'pass' ? '#DCFCE7' : '#FEE2E2',
              color: run.status === 'pass' ? '#166534' : '#991B1B',
            }}
          >
            {run.status}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: '8px 14px', background: '#FAFAFA' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                {run.steps.map((step: PipelineStep) => (
                  <tr key={step.name} style={{ borderBottom: '1px solid #F0F0F0' }}>
                    <td style={{ padding: '4px 8px', width: '24px' }}>
                      <span style={{ color: STATUS_COLOR[step.status] ?? '#999' }}>
                        {STATUS_ICON[step.status] ?? '?'}
                      </span>
                    </td>
                    <td style={{ padding: '4px 8px' }}>{step.display_name}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      {formatDuration(step.duration_s)}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      {formatTriples(step.triples)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#999',
  textAlign: 'center',
  textTransform: 'uppercase',
}

const tdStyle: React.CSSProperties = {
  padding: '8px',
  textAlign: 'center',
}
