// WS-5 B4/B5 — Console HITL review surface for LLM-proposed field mappings.
//
// When a tour snapshot is active, the data source is the Crestline seed and
// the TransportFlow left panel is rendered (Stage 5 "two-panel" beat). When
// no snapshot is active, the page falls through to the live AAM proxy and
// renders the existing two-column proposals/detail layout.
import { useEffect, useState } from 'react'
import {
  decideProposedMapping,
  fetchProposedMappings,
  type ProposedMapping,
  type ProposedMappingsResponse,
} from '../api/proposed_mappings'
import TransportFlow from '../components/TransportFlow'
import { useEnvSnapshot } from '../hooks/useEnvSnapshot'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'
import { mappingsAtStage, SEED_PIPES } from '../demo/seed'

const POLL_INTERVAL_MS = 30_000
const SEED_TENANT_ID = 'tour-seed-tenant'

function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'proposed':
      return { background: 'rgba(245,158,11,0.22)', color: '#FCD34D' }
    case 'failed':
      return { background: 'rgba(239,68,68,0.22)', color: '#FCA5A5' }
    case 'capped':
      return { background: 'rgba(107,114,128,0.22)', color: '#D1D5DB' }
    case 'no_proposal':
      return { background: 'rgba(59,130,246,0.22)', color: '#93C5FD' }
    case 'auto_apply':
    case 'auto_applied':
    case 'confirmed':
      return { background: 'rgba(34,197,94,0.22)', color: '#86EFAC' }
    case 'rejected':
      return { background: 'rgba(239,68,68,0.22)', color: '#FCA5A5' }
    default:
      return { background: 'rgba(107,114,128,0.22)', color: '#D1D5DB' }
  }
}

function confidenceColor(conf: number | null): string {
  if (conf == null) return 'var(--text-muted)'
  if (conf >= 0.95) return '#86EFAC'
  if (conf >= 0.70) return '#FCD34D'
  return '#FCA5A5'
}

export default function MappingsReview() {
  const snapshot = useEnvSnapshot()
  const [data, setData] = useState<ProposedMappingsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ProposedMapping | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [selectedPipeId, setSelectedPipeId] = useState<string>(SEED_PIPES[0]?.pipe_id ?? '')

  const load = async () => {
    setError(null)
    try {
      const res = await fetchProposedMappings({ limit: 200 })
      setData(res)
      setLastRefresh(new Date())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const decide = async (p: ProposedMapping, decision: 'auto_apply' | 'rejected') => {
    const key = `${p.tenant_id}::${p.vendor}::${p.source_field}`
    setPending(key)
    setError(null)
    if (snapshot) {
      // Seed mode: mutate the in-memory state only — no AAM write.
      setData((prev) => {
        if (!prev) return prev
        const updated = prev.proposals.map((m) =>
          m.tenant_id === p.tenant_id && m.vendor === p.vendor && m.source_field === p.source_field
            ? { ...m, status: decision === 'auto_apply' ? 'capped' as const : 'failed' as const }
            : m,
        )
        return { ...prev, proposals: updated }
      })
      const next: ProposedMapping = { ...p, status: decision === 'auto_apply' ? 'capped' : 'failed' }
      setSelected(next)
      setPending(null)
      return
    }
    try {
      const res = await decideProposedMapping({
        tenant_id: p.tenant_id,
        source_system: p.source_system,
        vendor: p.vendor,
        source_field: p.source_field,
        decision,
      })
      setSelected(res.proposal)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(null)
    }
  }

  useEffect(() => {
    if (snapshot) {
      const seed = mappingsAtStage(snapshot)
      const mapped: ProposedMapping[] = seed.visible.map((m) => ({
        tenant_id: SEED_TENANT_ID,
        source_system: m.source_system,
        vendor: m.vendor,
        source_field: m.source_field,
        concept: m.concept,
        property: m.property,
        confidence: m.confidence,
        reasoning: m.reasoning,
        model_id: 'tour-seed-v1',
        status: seedStatusToProposed(m.status),
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      }))
      const status_counts: Record<string, number> = {}
      for (const m of mapped) status_counts[m.status] = (status_counts[m.status] ?? 0) + 1
      // Honor the tour's confirmed-vs-total counts so the summary line is
      // believable even though the visible row count is smaller (16 samples).
      status_counts['confirmed_total'] = seed.confirmed
      setData({ count: seed.total, status_counts, proposals: mapped })
      setLastRefresh(new Date())
      return
    }
    load()
    const t = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [snapshot])

  const totalConfirmed = data?.status_counts['confirmed_total']

  useSurfaceExtras('page:mappings-review', {
    visible_panels: snapshot
      ? ['Transport flow (left)', 'Proposals (right)', 'Proposal detail']
      : ['Proposals', 'Proposal detail'],
    extra: {
      page: 'mappings-review',
      mappings_visible: data?.proposals.length ?? 0,
      mappings_total: data?.count ?? null,
      mappings_confirmed_total: totalConfirmed ?? null,
      data_source: snapshot ? 'tour-snapshot' : 'live-aam',
    },
  })

  return (
    <div style={{ padding: '16px 4px' }} data-testid="mappings-review">
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>
        Semantic Mapping — LLM Review Queue
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
        Fields the LLM proposed mappings for. Auto-applied at ≥0.95; mid-confidence needs review.
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', padding: '8px 12px', borderRadius: 6, color: '#FCA5A5', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }} data-testid="status-summary">
          <span>{data.count} total</span>
          {totalConfirmed !== undefined && (
            <span data-testid="mappings-confirmed-count">
              <span style={{ ...statusStyle('confirmed'), padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>confirmed</span>
              {totalConfirmed}
            </span>
          )}
          {Object.entries(data.status_counts)
            .filter(([k]) => k !== 'confirmed_total')
            .map(([status, count]) => (
              <span key={status}>
                <span style={{ ...statusStyle(status), padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>
                  {status}
                </span>
                {count}
              </span>
            ))}
          {lastRefresh && (
            <span style={{ marginLeft: 'auto' }}>
              refreshed {lastRefresh.toLocaleTimeString()}{snapshot ? '' : ' · polls every 30s'}
            </span>
          )}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: snapshot ? '1fr 1.4fr 1.4fr' : '1fr 1fr',
          gap: 16,
        }}
      >
        {snapshot && (
          <TransportFlow selectedPipeId={selectedPipeId} onSelectPipe={setSelectedPipeId} />
        )}

        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Proposals</div>
          {data && data.proposals.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }} data-testid="empty-state">
              No proposed mappings yet.
            </div>
          )}
          {data && data.proposals.length > 0 && (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }} data-testid="proposals-table">
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '4px 6px' }}>vendor</th>
                  <th style={{ padding: '4px 6px' }}>source</th>
                  <th style={{ padding: '4px 6px' }}>field</th>
                  <th style={{ padding: '4px 6px' }}>concept</th>
                  <th style={{ padding: '4px 6px' }}>conf</th>
                  <th style={{ padding: '4px 6px' }}>status</th>
                </tr>
              </thead>
              <tbody>
                {data.proposals.map((p, idx) => {
                  const key = `${p.tenant_id}::${p.vendor}::${p.source_field}::${idx}`
                  const isSelected = selected
                    && selected.tenant_id === p.tenant_id
                    && selected.vendor === p.vendor
                    && selected.source_field === p.source_field
                  return (
                    <tr
                      key={key}
                      onClick={() => setSelected(p)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(59,130,246,0.12)' : 'transparent',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                      }}
                      data-testid="proposal-row"
                    >
                      <td style={{ padding: '4px 6px' }}>{p.vendor}</td>
                      <td style={{ padding: '4px 6px' }}>{p.source_system}</td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{p.source_field}</td>
                      <td style={{ padding: '4px 6px' }}>
                        {p.concept ? `${p.concept}.${p.property ?? ''}` : <em style={{ color: 'var(--text-muted)' }}>—</em>}
                      </td>
                      <td style={{ padding: '4px 6px', color: confidenceColor(p.confidence) }}>
                        {p.confidence != null ? p.confidence.toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <span style={{ ...statusStyle(p.status), padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 12 }} data-testid="proposal-detail">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Proposal detail</div>
          {!selected && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Select a row to see the LLM's reasoning + the proposal payload.
            </div>
          )}
          {selected && (
            <div style={{ fontSize: 12 }}>
              <Field label="vendor">{selected.vendor}</Field>
              <Field label="source_system">{selected.source_system}</Field>
              <Field label="source_field" mono>{selected.source_field}</Field>
              <Field label="proposed concept" mono>
                {selected.concept ? `${selected.concept}.${selected.property ?? ''}` : '—'}
              </Field>
              <Field label="confidence">
                <span style={{ color: confidenceColor(selected.confidence) }}>
                  {selected.confidence != null ? selected.confidence.toFixed(3) : '—'}
                </span>
              </Field>
              <Field label="status">
                <span style={{ ...statusStyle(selected.status), padding: '2px 8px', borderRadius: 10 }}>
                  {selected.status}
                </span>
              </Field>
              <Field label="model">{selected.model_id}</Field>
              <Field label="proposed at">{new Date(selected.created_at).toLocaleString()}</Field>
              <div style={{ marginTop: 8 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  reasoning
                </div>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, marginTop: 4, fontFamily: 'monospace', fontSize: 11 }}>
                  {selected.reasoning ?? <em style={{ color: 'var(--text-muted)' }}>(no reasoning recorded)</em>}
                </div>
              </div>

              {selected.status === 'proposed' && (
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }} data-testid="decision-actions">
                  {(() => {
                    const key = `${selected.tenant_id}::${selected.vendor}::${selected.source_field}`
                    const isPending = pending === key
                    return (
                      <>
                        <button
                          disabled={isPending}
                          onClick={() => decide(selected, 'auto_apply')}
                          data-testid="btn-accept"
                          style={{
                            padding: '6px 14px', borderRadius: 4, fontSize: 12,
                            background: 'rgba(34,197,94,0.22)', color: '#86EFAC',
                            border: '1px solid rgba(34,197,94,0.35)',
                            cursor: isPending ? 'wait' : 'pointer',
                          }}
                        >
                          {isPending ? 'Applying...' : 'Accept (auto-apply)'}
                        </button>
                        <button
                          disabled={isPending}
                          onClick={() => decide(selected, 'rejected')}
                          data-testid="btn-reject"
                          style={{
                            padding: '6px 14px', borderRadius: 4, fontSize: 12,
                            background: 'rgba(239,68,68,0.22)', color: '#FCA5A5',
                            border: '1px solid rgba(239,68,68,0.35)',
                            cursor: isPending ? 'wait' : 'pointer',
                          }}
                        >
                          {isPending ? 'Applying...' : 'Reject'}
                        </button>
                      </>
                    )
                  })()}
                </div>
              )}
              {(selected.status === 'capped' || selected.status === 'failed') && snapshot && (
                <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }} data-testid="decided-note">
                  Decision recorded for this tour walkthrough. In live mode, the next ingest run will reflect it on the field.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function seedStatusToProposed(s: 'proposed' | 'confirmed' | 'rejected' | 'auto_applied'): ProposedMapping['status'] {
  if (s === 'confirmed') return 'capped'
  if (s === 'auto_applied') return 'capped'
  if (s === 'rejected') return 'failed'
  return 'proposed'
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'baseline' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', width: 110, flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ fontFamily: mono ? 'monospace' : 'inherit' }}>{children}</div>
    </div>
  )
}
