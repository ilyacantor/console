import { useEffect, useState } from 'react'
import { fetchEngagements, createEngagement, fetchRuns, fetchEngagementHistory, type Engagement, type EngagementHistoryEvent } from '../api/client'
import { useEngagement } from '../context/EngagementContext'

function TypePill({ type }: { type: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    SE: { bg: '#DBEAFE', text: '#1E40AF' },
    ME: { bg: '#E0E7FF', text: '#3730A3' },
    MA: { bg: '#FCE7F3', text: '#9D174D' },
  }
  const c = colors[type] ?? colors.SE!
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, background: c!.bg, color: c!.text, borderRadius: '4px', padding: '2px 8px' }}>
      {type === 'MA' ? 'M&A' : type}
    </span>
  )
}

function StagePill({ stage }: { stage: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    upload: { bg: '#F3F4F6', text: '#6B7280' },
    map: { bg: '#DBEAFE', text: '#1E40AF' },
    review: { bg: '#FEF9C3', text: '#854D0E' },
    combine: { bg: '#FDE68A', text: '#92400E' },
    deliver: { bg: '#DCFCE7', text: '#166534' },
    closed: { bg: '#E5E7EB', text: '#374151' },
  }
  const c = colors[stage] ?? colors.upload!
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, background: c!.bg, color: c!.text, borderRadius: '4px', padding: '2px 8px' }}>
      {stage}
    </span>
  )
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '--'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Engagements() {
  const { activeEngagement, setActiveEngagement, refresh: refreshContext } = useEngagement()
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [selected, setSelected] = useState<Engagement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [entities, setEntities] = useState<string[]>([])
  const [newAcquirer, setNewAcquirer] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newType, setNewType] = useState('MA')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<EngagementHistoryEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = () => {
    fetchEngagements()
      .then(({ engagements: e }) => { setEngagements(e); setLoaded(true) })
      .catch((err) => { setLoaded(true); setError(err instanceof Error ? err.message : 'Failed to load engagements') })
  }

  useEffect(() => {
    load()
    // Build entity list from pipeline runs + existing engagements
    const names = new Set<string>()
    fetchRuns(50)
      .then(({ runs }) => {
        for (const r of runs) {
          for (const eid of r.entity_ids ?? []) names.add(eid)
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pipeline runs'))
      .finally(() => {
        fetchEngagements()
          .then(({ engagements: e }) => {
            for (const eng of e) {
              names.add(eng.acquirer_entity_id)
              names.add(eng.target_entity_id)
            }
          })
          .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load engagements'))
          .finally(() => {
            if (names.size === 0) {
              names.add('meridian')
              names.add('cascadia')
            }
            setEntities([...names].sort())
          })
      })
  }, [])

  const handleCreate = async () => {
    if (!newAcquirer || !newTarget) {
      setError('Select both acquirer and target')
      return
    }
    if (newAcquirer === newTarget) {
      setError('Acquirer and target must be different entities')
      return
    }
    setCreating(true)
    setError(null)
    try {
      await createEngagement({
        acquirer_entity_id: newAcquirer,
        target_entity_id: newTarget,
        engagement_type: newType,
      })
      setShowCreate(false)
      setNewAcquirer('')
      setNewTarget('')
      load()
      refreshContext()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create engagement')
    }
    setCreating(false)
  }

  // Fetch history when an engagement is selected
  useEffect(() => {
    if (!selected) { setHistory([]); return }
    setHistoryLoading(true)
    fetchEngagementHistory(selected.engagement_id)
      .then(({ events }) => setHistory(events))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'))
      .finally(() => setHistoryLoading(false))
  }, [selected?.engagement_id])

  const state = selected?.state_json as Record<string, number> | undefined

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      {error && !showCreate && (
        <div style={{ padding: '8px 12px', marginBottom: '16px', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '12px' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '16px', fontWeight: 600 }}>Engagements</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          + New engagement
        </button>
      </div>

      {showCreate && (
        <div style={{ padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>New engagement</div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Acquirer</label>
              <select
                value={newAcquirer}
                onChange={(e) => setNewAcquirer(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', width: '200px' }}
              >
                <option value="">Select entity</option>
                {entities.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Target</label>
              <select
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', width: '200px' }}
              >
                <option value="">Select entity</option>
                {entities.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)' }}
              >
                <option value="MA">M&A</option>
                <option value="SE">Single entity</option>
                <option value="ME">Multi-entity</option>
              </select>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '6px', background: '#3B82F6', color: '#fff', cursor: creating ? 'default' : 'pointer' }}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setError(null) }}
              style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
          {error && <div style={{ marginTop: '8px', fontSize: '12px', color: '#EF4444' }}>{error}</div>}
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)', overflow: 'hidden', marginBottom: '20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              {['ID', 'Acquirer', 'Target', 'Type', 'Status', 'Last activity'].map((h) => (
                <th key={h} style={{ padding: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {engagements.map((e) => (
              <tr
                key={e.engagement_id}
                onClick={() => {
                  setSelected(selected?.engagement_id === e.engagement_id ? null : e)
                  setActiveEngagement(e)
                }}
                style={{
                  cursor: 'pointer',
                  borderBottom: '0.5px solid var(--border)',
                  background: selected?.engagement_id === e.engagement_id ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: e.engagement_id === activeEngagement?.engagement_id ? '3px solid #3B82F6' : '3px solid transparent',
                }}
              >
                <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }} title={e.engagement_id}>{e.engagement_short_name || e.engagement_id}</td>
                <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{e.acquirer_entity_id}</td>
                <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{e.target_entity_id}</td>
                <td style={{ padding: '8px' }}><TypePill type={e.engagement_type} /></td>
                <td style={{ padding: '8px' }}><StagePill stage={e.lifecycle_stage} /></td>
                <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{timeAgo(e.updated_at)}</td>
              </tr>
            ))}
            {loaded && engagements.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>No engagements</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div style={{ padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Deal state</div>
            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Lifecycle stage</span>
                <StagePill stage={selected.lifecycle_stage} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Conflicts resolved</span>
                <span style={{ color: 'var(--text-primary)' }}>{state?.conflicts_resolved ?? 0} / {state?.conflicts_total ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Deliverables ready</span>
                <span style={{ color: 'var(--text-primary)' }}>{state?.deliverables_ready ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total cost</span>
                <span style={{ color: 'var(--text-primary)' }}>${(state?.total_cost ?? 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total runs</span>
                <span style={{ color: 'var(--text-primary)' }}>{state?.total_runs ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total tokens</span>
                <span style={{ color: 'var(--text-primary)' }}>{(state?.total_tokens ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div style={{ padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>History</div>
            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {historyLoading && (
                <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
              )}
              {!historyLoading && history.length > 0 && history.map((evt, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: '60px' }}>{timeAgo(evt.timestamp)}</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0, width: '50px', textTransform: 'uppercase' }}>{evt.source}</span>
                  <span>{evt.description}</span>
                </div>
              ))}
              {!historyLoading && history.length === 0 && (
                <>
                  <div style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: '60px' }}>{timeAgo(selected.updated_at)}</span>
                    <span>Stage updated to {selected.lifecycle_stage}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: '60px' }}>{timeAgo(selected.created_at)}</span>
                    <span>Engagement created — {selected.acquirer_entity_id} + {selected.target_entity_id}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
