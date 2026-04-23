import { useState, useEffect, useCallback } from 'react'
import { fetchConvergenceEngagements, type ConvergenceEngagement } from '../api/client'

const CONVERGENCE_BASE = import.meta.env.VITE_CONVERGENCE_URL || 'http://localhost:3010'

interface ResolutionSummary {
  per_domain: Record<string, Record<string, number>>
  totals: Record<string, number>
  total_decisions: number
}

const STAGE_STYLES: Record<string, string> = {
  active: 'background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3)',
  draft: 'background: rgba(156,163,175,0.15); color: #9ca3af; border: 1px solid rgba(156,163,175,0.3)',
  paused: 'background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3)',
  archived: 'background: rgba(107,114,128,0.15); color: #6b7280; border: 1px solid rgba(107,114,128,0.3)',
}

function relativeTime(iso: string | null): string {
  if (!iso) return '\u2014'
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Convergence() {
  const [engagements, setEngagements] = useState<ConvergenceEngagement[]>([])
  const [summaries, setSummaries] = useState<Record<string, ResolutionSummary>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const engs = await fetchConvergenceEngagements()
      setEngagements(engs)
      setError(null)

      const sumEntries: Record<string, ResolutionSummary> = {}
      await Promise.all(
        engs.map(async (eng) => {
          try {
            const resp = await fetch(`/api/engagements/${eng.engagement_id}/resolutions/summary`)
            if (resp.ok) {
              sumEntries[eng.engagement_id] = await resp.json()
            }
          } catch {
            // Resolution summary is optional — engagement list still renders
          }
        }),
      )
      setSummaries(sumEntries)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch engagements')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const convergenceLink = (path: string) => `${CONVERGENCE_BASE}${path}`

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: 'var(--text-muted)', fontSize: 13 }}>
        Loading Convergence engagements...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary, #fafafa)', margin: 0 }}>
          Convergence Monitor
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchData}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: 'var(--bg-secondary, #1e1e2e)',
              color: 'var(--text-muted, #9ca3af)',
              border: '1px solid var(--border, #374151)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
          <a
            href={convergenceLink('/engagements')}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: 'rgba(6,182,212,0.15)',
              color: '#22d3ee',
              border: '1px solid rgba(6,182,212,0.3)',
              borderRadius: 6,
              textDecoration: 'none',
            }}
            data-testid="open-convergence-link"
          >
            Open in Convergence
          </a>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {engagements.length === 0 && !error ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted, #6b7280)', fontSize: 13 }}>
          No Convergence engagements found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {engagements.map((eng) => {
            const summary = summaries[eng.engagement_id]
            const totals = summary?.totals || {}

            return (
              <div
                key={eng.engagement_id}
                style={{
                  background: 'var(--bg-secondary, #1e1e2e)',
                  border: '1px solid var(--border, #374151)',
                  borderRadius: 10,
                  padding: '16px 20px',
                }}
                data-testid={`convergence-engagement-${eng.engagement_id}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary, #fafafa)' }}>
                      {eng.engagement_short_name || eng.engagement_id.slice(0, 8)}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 500,
                        borderRadius: 12,
                        ...(Object.fromEntries(
                          (STAGE_STYLES[eng.lifecycle_stage] ?? STAGE_STYLES.draft ?? '')
                            .split(';')
                            .filter(Boolean)
                            .map((s) => {
                              const [k, v] = s.split(':').map((x) => x.trim())
                              return [k, v]
                            }),
                        ) as any),
                      }}
                    >
                      {eng.lifecycle_stage}
                    </span>
                    <span style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 12 }}>
                      {eng.acquirer_entity_id} &harr; {eng.target_entity_id}
                    </span>
                  </div>

                  <a
                    href={convergenceLink(`/engagements/${eng.engagement_id}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      color: '#22d3ee',
                      textDecoration: 'none',
                      border: '1px solid rgba(6,182,212,0.3)',
                      borderRadius: 6,
                    }}
                    data-testid={`deep-link-${eng.engagement_id}`}
                  >
                    View in Convergence &rarr;
                  </a>
                </div>

                {/* Resolution progress */}
                {summary && summary.total_decisions > 0 && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
                    {[
                      { key: 'auto_accepted', label: 'Auto', color: '#4ade80' },
                      { key: 'confirmed', label: 'Confirmed', color: '#4ade80' },
                      { key: 'pending_hitl', label: 'Pending', color: '#fbbf24' },
                      { key: 'rejected', label: 'Rejected', color: '#f87171' },
                      { key: 'deferred', label: 'Deferred', color: '#9ca3af' },
                    ].map(({ key, label, color }) => {
                      const count = totals[key] || 0
                      if (count === 0) return null
                      return (
                        <span key={key} style={{ color }}>
                          {count} {label}
                        </span>
                      )
                    })}
                    <span style={{ color: 'var(--text-muted, #6b7280)' }}>
                      {summary.total_decisions} total decisions
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text-muted, #6b7280)' }}>
                  <span>Created {relativeTime(eng.created_at)}</span>
                  <span>ID: {eng.engagement_id.slice(0, 8)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
