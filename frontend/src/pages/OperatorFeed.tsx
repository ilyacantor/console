import { useEffect, useState, useRef, useCallback } from 'react'
import { fetchOperatorFeedPlans, type MaiPlan, type MaiPlansResponse } from '../api/client'
import { useEngagement } from '../context/EngagementContext'

const REFRESH_INTERVAL_MS = 30_000

type TierFilter = 'all' | 'tier_3_plan' | 'tier_4_escalate'
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'executing' | 'executed' | 'failed'

const TIER_LABELS: Record<string, string> = {
  tier_1_auto: 'Tier 1 Auto',
  tier_2_validate: 'Tier 2 Validate',
  tier_3_plan: 'Tier 3 Plan',
  tier_4_escalate: 'Tier 4 Escalate',
}

const TIER_COLORS: Record<string, { bg: string; fg: string }> = {
  tier_1_auto: { bg: '#DCFCE7', fg: '#166534' },
  tier_2_validate: { bg: '#DBEAFE', fg: '#1E40AF' },
  tier_3_plan: { bg: '#FEF9C3', fg: '#854D0E' },
  tier_4_escalate: { bg: '#FEE2E2', fg: '#991B1B' },
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#FEF9C3', fg: '#854D0E' },
  approved: { bg: '#DCFCE7', fg: '#166534' },
  rejected: { bg: '#FEE2E2', fg: '#991B1B' },
  executing: { bg: '#DBEAFE', fg: '#1E40AF' },
  executed: { bg: '#D1FAE5', fg: '#065F46' },
  failed: { bg: '#FEE2E2', fg: '#991B1B' },
}

function TierBadge({ tier }: { tier: string }) {
  const colors = TIER_COLORS[tier] ?? { bg: '#F3F4F6', fg: '#6B7280' }
  return (
    <span
      data-testid="tier-badge"
      style={{
        fontSize: '11px', fontWeight: 600,
        background: colors.bg, color: colors.fg,
        borderRadius: '4px', padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {TIER_LABELS[tier] ?? tier}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? { bg: '#F3F4F6', fg: '#6B7280' }
  return (
    <span
      data-testid="status-badge"
      style={{
        fontSize: '11px', fontWeight: 600,
        background: colors.bg, color: colors.fg,
        borderRadius: '4px', padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

function ModuleChip({ name }: { name: string }) {
  return (
    <span style={{
      fontSize: '10px', fontWeight: 500,
      background: 'var(--bg-card)', color: 'var(--text-secondary)',
      borderRadius: '3px', padding: '1px 6px',
      border: '0.5px solid var(--border)',
    }}>
      {name.toUpperCase()}
    </span>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function PlanCard({ plan }: { plan: MaiPlan }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      data-testid="plan-card"
      style={{
        background: 'var(--bg-surface)',
        border: '0.5px solid var(--border)',
        borderRadius: '8px',
        padding: '14px 16px',
      }}
    >
      {/* Header row: badges + timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <TierBadge tier={plan.plan_type} />
        <StatusBadge status={plan.status} />
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
          {timeAgo(plan.created_at)}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
        {plan.title}
      </div>

      {/* Rationale */}
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
        {plan.rationale}
      </div>

      {/* Affected modules */}
      {plan.affected_modules.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {plan.affected_modules.map((m) => <ModuleChip key={m} name={m} />)}
        </div>
      )}

      {/* Customer message (truncated unless expanded) */}
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '6px' }}>
        {expanded || plan.customer_message.length <= 120
          ? `"${plan.customer_message}"`
          : `"${plan.customer_message.slice(0, 120)}..."`}
      </div>

      {/* Expand toggle */}
      <button
        data-testid="expand-toggle"
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '11px', color: 'var(--text-muted)', padding: 0,
          textDecoration: 'underline',
        }}
      >
        {expanded ? 'Collapse' : 'Details'}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid var(--border)' }}>
          {plan.impact_analysis && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px' }}>Impact Analysis</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{plan.impact_analysis}</div>
            </div>
          )}
          {plan.plan_body && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px' }}>Plan Body</div>
              <pre style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '8px', borderRadius: '4px', overflow: 'auto', margin: 0 }}>
                {JSON.stringify(plan.plan_body, null, 2)}
              </pre>
            </div>
          )}
          {plan.approved_by && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px' }}>Approved by</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{plan.approved_by}</div>
            </div>
          )}
          {plan.result_summary && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px' }}>Result</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{plan.result_summary}</div>
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            ID: {plan.id}
          </div>
        </div>
      )}
    </div>
  )
}

export default function OperatorFeed() {
  const { activeEngagement } = useEngagement()
  const [plans, setPlans] = useState<MaiPlan[]>([])
  const [total, setTotal] = useState(0)
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const tenantId = activeEngagement?.tenant_id

  const fetchPlans = useCallback(async () => {
    if (!tenantId) return

    setLoading(true)
    setError(null)

    const params: { tenant_id: string; status?: string; limit?: number } = {
      tenant_id: tenantId,
      limit: 100,
    }
    if (statusFilter !== 'all') params.status = statusFilter

    try {
      const resp: MaiPlansResponse = await fetchOperatorFeedPlans(params)
      let filtered = resp.plans
      if (tierFilter !== 'all') {
        filtered = filtered.filter((p) => p.plan_type === tierFilter)
      }
      setPlans(filtered)
      setTotal(resp.total)
      setLastRefresh(new Date())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch plans'
      setError(msg)
      setPlans([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [tenantId, tierFilter, statusFilter])

  // Initial fetch + re-fetch on filter change
  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  // 30-second auto-refresh
  useEffect(() => {
    intervalRef.current = setInterval(fetchPlans, REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchPlans])

  const selectStyle: React.CSSProperties = {
    padding: '2px 8px', fontSize: '12px',
    border: '1px solid var(--border)', borderRadius: '4px',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
  }

  return (
    <div style={{ padding: '24px', maxWidth: '720px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Operator Feed</h1>

      {/* Filters row */}
      <div data-testid="filter-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tier:</span>
          <select
            data-testid="tier-filter"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as TierFilter)}
            style={selectStyle}
          >
            <option value="all">All</option>
            <option value="tier_3_plan">Tier 3 Plan</option>
            <option value="tier_4_escalate">Tier 4 Escalate</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</span>
          <select
            data-testid="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={selectStyle}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="executing">Executing</option>
            <option value="executed">Executed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            data-testid="auto-refresh-indicator"
            style={{ fontSize: '11px', color: 'var(--text-muted)' }}
          >
            Auto-refresh 30s
          </span>
          {lastRefresh && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {'\u00B7'} {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* No tenant warning */}
      {!tenantId && (
        <div data-testid="no-tenant" style={{
          padding: '24px', textAlign: 'center', color: 'var(--text-muted)',
          background: 'var(--bg-surface)', borderRadius: '8px',
          border: '0.5px solid var(--border)',
        }}>
          No active engagement with a tenant ID. Select an engagement to view escalations.
        </div>
      )}

      {/* Error state */}
      {error && (
        <div data-testid="feed-error" style={{
          padding: '12px 16px', marginBottom: '12px',
          background: '#FEE2E2', color: '#991B1B',
          borderRadius: '8px', fontSize: '12px',
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && plans.length === 0 && !error && tenantId && (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          Loading plans...
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && tenantId && plans.length === 0 && (
        <div data-testid="empty-state" style={{
          padding: '24px', textAlign: 'center', color: 'var(--text-muted)',
          background: 'var(--bg-surface)', borderRadius: '8px',
          border: '0.5px solid var(--border)',
        }}>
          No escalation plans found{tierFilter !== 'all' || statusFilter !== 'all' ? ' for current filters' : ''}.
        </div>
      )}

      {/* Plan cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      {/* Footer summary */}
      {plans.length > 0 && (
        <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Showing {plans.length} of {total} plan{total !== 1 ? 's' : ''}.
        </div>
      )}
    </div>
  )
}
