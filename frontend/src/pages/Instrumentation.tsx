import { useEffect, useState } from 'react'
import { fetchInstrumentationRuns, fetchInstrumentationSummary, type MaiRun, type InstrumentationSummary } from '../api/client'
import { useEngagement } from '../context/EngagementContext'

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const bg = status === 'success' ? '#DCFCE7' : status === 'failed' ? '#FEE2E2' : '#F3F4F6'
  const fg = status === 'success' ? '#166534' : status === 'failed' ? '#991B1B' : '#6B7280'
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, background: bg, color: fg, borderRadius: '4px', padding: '2px 8px' }}>
      {status}
    </span>
  )
}

type SortKey = 'step_name' | 'duration_s' | 'tokens' | 'cost_usd' | 'status'

export default function Instrumentation() {
  const { activeEngagement } = useEngagement()
  const [runs, setRuns] = useState<MaiRun[]>([])
  const [summary, setSummary] = useState<InstrumentationSummary | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('step_name')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    const engId = activeEngagement?.engagement_id
    const params: { step_name?: string; engagement_id?: string } = {}
    if (filter !== 'all') params.step_name = filter
    if (engId) params.engagement_id = engId
    fetchInstrumentationRuns(params).then((r) => setRuns(r.runs)).catch(() => {})
    fetchInstrumentationSummary(engId).then(setSummary).catch(() => {})
  }, [filter, activeEngagement?.engagement_id])

  const stepNames = [...new Set(runs.map((r) => r.step_name))]

  const sorted = [...runs].sort((a, b) => {
    let av: number | string, bv: number | string
    switch (sortKey) {
      case 'step_name': av = a.step_name; bv = b.step_name; break
      case 'duration_s': av = a.duration_s ?? 0; bv = b.duration_s ?? 0; break
      case 'tokens': av = (a.tokens_in ?? 0) + (a.tokens_out ?? 0); bv = (b.tokens_in ?? 0) + (b.tokens_out ?? 0); break
      case 'cost_usd': av = a.cost_usd ?? 0; bv = b.cost_usd ?? 0; break
      case 'status': av = a.status; bv = b.status; break
    }
    if (av < bv) return sortAsc ? -1 : 1
    if (av > bv) return sortAsc ? 1 : -1
    return 0
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const headerStyle = (_key: SortKey): React.CSSProperties => ({
    padding: '6px 8px', fontSize: '11px', fontWeight: 600, textAlign: 'left',
    color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid var(--border)',
  })

  const totalCost = summary?.total_cost ?? 0
  const totalRuns = summary?.total_runs ?? 0

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Instrumentation</h1>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <SummaryCard label="Total runs" value={String(summary?.total_runs ?? 0)} />
        <SummaryCard label="Total tokens" value={(summary?.total_tokens ?? 0).toLocaleString()} />
        <SummaryCard label="Total cost" value={`$${(summary?.total_cost ?? 0).toFixed(2)}`} />
        <SummaryCard label="Avg COFA duration" value={`${(summary?.avg_duration_s ?? 0).toFixed(1)}s`} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Filter:</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: '2px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)' }}
        >
          <option value="all">All steps</option>
          {stepNames.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={headerStyle('step_name')} onClick={() => toggleSort('step_name')}>Step name{sortKey === 'step_name' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}</th>
              <th style={{ ...headerStyle('step_name'), cursor: 'default' }}>Run tag</th>
              <th style={headerStyle('duration_s')} onClick={() => toggleSort('duration_s')}>Duration{sortKey === 'duration_s' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}</th>
              <th style={headerStyle('tokens')} onClick={() => toggleSort('tokens')}>Tokens{sortKey === 'tokens' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}</th>
              <th style={headerStyle('cost_usd')} onClick={() => toggleSort('cost_usd')}>Cost{sortKey === 'cost_usd' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}</th>
              <th style={headerStyle('status')} onClick={() => toggleSort('status')}>Status{sortKey === 'status' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.mai_run_id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>{r.step_name}</td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '11px' }}>{r.run_tag}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{r.duration_s?.toFixed(1)}s</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{((r.tokens_in ?? 0) + (r.tokens_out ?? 0)).toLocaleString()}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>${r.cost_usd?.toFixed(2)}</td>
                <td style={{ padding: '6px 8px' }}><StatusPill status={r.status} /></td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>No runs found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Last 7 days: ${totalCost.toFixed(2)} across {totalRuns} runs. Avg: ${totalRuns > 0 ? (totalCost / totalRuns).toFixed(2) : '0.00'}/run.
      </div>
    </div>
  )
}
