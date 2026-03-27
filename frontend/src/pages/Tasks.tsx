import { useEffect, useState } from 'react'
import { fetchEngagements, type Engagement } from '../api/client'

interface ReviewItem {
  id: string
  engagement: string
  type: 'conflict' | 'mapping' | 'reclassification'
  description: string
  impact: string
  severity: 'high' | 'medium' | 'low'
  status: 'pending' | 'approved' | 'rejected'
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: '#FEE2E2', text: '#991B1B' },
  medium: { bg: '#FEF9C3', text: '#854D0E' },
  low: { bg: '#F3F4F6', text: '#6B7280' },
}

function SeverityPill({ severity }: { severity: string }) {
  const c = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low!
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, background: c!.bg, color: c!.text, borderRadius: '4px', padding: '2px 8px' }}>
      {severity}
    </span>
  )
}

export default function Tasks() {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [items, setItems] = useState<ReviewItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetchEngagements()
      .then(({ engagements: e }) => {
        setEngagements(e)
        // Derive review items from engagement state_json
        const reviewItems: ReviewItem[] = []
        for (const eng of e) {
          const state = eng.state_json as Record<string, unknown>
          const conflicts = (state?.conflicts_total as number) || 0
          const resolved = (state?.conflicts_resolved as number) || 0
          const pending = conflicts - resolved
          if (pending > 0) {
            reviewItems.push({
              id: `${eng.engagement_id}-conflicts`,
              engagement: `${eng.acquirer_entity_id} + ${eng.target_entity_id}`,
              type: 'conflict',
              description: `${pending} COFA conflict${pending > 1 ? 's' : ''} awaiting resolution`,
              impact: state?.conflict_impact ? `$${Number(state.conflict_impact).toLocaleString()}` : '--',
              severity: pending > 3 ? 'high' : pending > 1 ? 'medium' : 'low',
              status: 'pending',
            })
          }
        }
        setItems(reviewItems)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const pendingCount = items.filter((i) => i.status === 'pending').length

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Tasks</h1>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <div style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Pending review</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: pendingCount > 0 ? '#EF4444' : 'var(--text-primary)' }}>{pendingCount}</div>
        </div>
        <div style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Active engagements</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{engagements.length}</div>
        </div>
        <div style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Completed today</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>0</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>Human review queue</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Conflicts, mappings, and reclassifications requiring human decision
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              {['Engagement', 'Type', 'Description', 'Impact', 'Severity', 'Status'].map((h) => (
                <th key={h} style={{ padding: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                <td style={{ padding: '8px', color: 'var(--text-primary)', fontWeight: 500 }}>{item.engagement}</td>
                <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{item.type}</td>
                <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{item.description}</td>
                <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)' }}>{item.impact}</td>
                <td style={{ padding: '8px' }}><SeverityPill severity={item.severity} /></td>
                <td style={{ padding: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, background: '#FEF9C3', color: '#854D0E', borderRadius: '4px', padding: '2px 8px' }}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
            {loaded && items.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No items pending review</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
