import { useEffect, useState } from 'react'
import {
  fetchIdentityAudit,
  fetchIdentityPending,
  postIdentityDecision,
  type IdentityAuditResponse,
  type IdentityPendingRow,
} from '../api/pipelines'

const TENANT_ID = import.meta.env.VITE_AOS_TENANT_ID || ''

type Tab = 'queue' | 'audit'

export default function PipelineIdentity() {
  const [tenantId, setTenantId] = useState<string>(TENANT_ID)
  const [rows, setRows] = useState<IdentityPendingRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('queue')
  const [auditTarget, setAuditTarget] = useState<string | null>(null)
  const [audit, setAudit] = useState<IdentityAuditResponse | null>(null)

  const load = async () => {
    setError(null)
    if (!tenantId) {
      setError('tenant_id is required to view the review queue. Set VITE_AOS_TENANT_ID or enter one above.')
      return
    }
    try {
      const res = await fetchIdentityPending({ tenant_id: tenantId })
      setRows(res.pending)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => { load() }, [tenantId])

  const onDecide = async (row: IdentityPendingRow, decision: 'approved' | 'rejected') => {
    setPending(row.hitl_queue_id)
    try {
      await postIdentityDecision({
        hitl_queue_id: row.hitl_queue_id,
        decision,
        decided_by: 'console-operator',
      })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(null)
    }
  }

  const showAudit = async (hitlQueueId: string) => {
    setAuditTarget(hitlQueueId)
    setAudit(null)
    setTab('audit')
    try {
      const a = await fetchIdentityAudit(hitlQueueId)
      setAudit(a)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div style={{ padding: '16px 4px' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>Identity Review Queue</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
        Pending fuzzy matches from the resolver. Approve to promote to canonical authority; reject to keep records separate.
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tenant:</label>
        <input data-testid="identity-tenant-input"
               value={tenantId}
               onChange={(e) => setTenantId(e.target.value)}
               placeholder="tenant_id (UUID)"
               style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', minWidth: '280px' }} />
        <button data-testid="identity-refresh-btn" onClick={load} style={refreshBtnStyle}>Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>
        <button data-testid="identity-tab-queue"
                onClick={() => setTab('queue')}
                style={tabStyle(tab === 'queue')}>Queue</button>
        <button data-testid="identity-tab-audit"
                onClick={() => setTab('audit')}
                style={tabStyle(tab === 'audit')}>Audit</button>
      </div>

      {error && (
        <div data-testid="identity-error"
             style={{ color: '#F87171', padding: '12px', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '6px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {tab === 'queue' && (
        <div>
          {rows === null && !error && <div data-testid="identity-loading" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
          {rows !== null && rows.length === 0 && <div data-testid="identity-empty" style={{ color: 'var(--text-muted)' }}>No matches pending review.</div>}
          {rows !== null && rows.length > 0 && (
            <table data-testid="identity-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                  <th style={cellHeaderStyle}>Domain</th>
                  <th style={cellHeaderStyle}>Left</th>
                  <th style={cellHeaderStyle}>Right</th>
                  <th style={cellHeaderStyle}>Confidence</th>
                  <th style={cellHeaderStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hitl_queue_id} data-testid="identity-row" data-hitl-id={r.hitl_queue_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={cellStyle}>{r.domain}</td>
                    <td style={cellStyle}>
                      <div><strong>{r.left_value}</strong></div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{r.left_record_key}</div>
                    </td>
                    <td style={cellStyle}>
                      <div><strong>{r.right_value}</strong></div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{r.right_record_key}</div>
                    </td>
                    <td style={cellStyle}>
                      <span data-testid="identity-confidence" style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '12px', background: 'rgba(245,158,11,0.22)', color: '#FCD34D' }}>
                        {Math.round(r.confidence * 100)}%
                      </span>
                    </td>
                    <td style={cellStyle}>
                      <button data-testid="identity-approve-btn"
                              disabled={pending === r.hitl_queue_id}
                              onClick={() => onDecide(r, 'approved')}
                              style={approveBtnStyle}>
                        {pending === r.hitl_queue_id ? 'Saving…' : 'Approve'}
                      </button>
                      <button data-testid="identity-reject-btn"
                              disabled={pending === r.hitl_queue_id}
                              onClick={() => onDecide(r, 'rejected')}
                              style={{ ...approveBtnStyle, marginLeft: '6px', background: 'transparent', color: '#FCA5A5', border: '1px solid #FCA5A5' }}>
                        Reject
                      </button>
                      <button data-testid="identity-audit-btn"
                              onClick={() => showAudit(r.hitl_queue_id)}
                              style={{ ...approveBtnStyle, marginLeft: '6px', background: 'transparent', color: '#22D3EE', border: '1px solid #22D3EE' }}>
                        Audit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div data-testid="identity-audit-panel">
          {!auditTarget && <div style={{ color: 'var(--text-muted)' }}>Pick a row in the queue to view its audit trail.</div>}
          {auditTarget && !audit && <div style={{ color: 'var(--text-muted)' }}>Loading audit…</div>}
          {audit && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                HITL queue id: <code>{audit.hitl_queue_id}</code> · status: <strong>{audit.status}</strong>
              </div>
              <table data-testid="identity-audit-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)' }}>
                    <th style={cellHeaderStyle}>Event</th>
                    <th style={cellHeaderStyle}>Actor</th>
                    <th style={cellHeaderStyle}>Timestamp</th>
                    <th style={cellHeaderStyle}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.audit.map((a, i) => (
                    <tr key={i} data-testid="identity-audit-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={cellStyle}>{a.event}</td>
                      <td style={cellStyle}>{a.actor || ''}</td>
                      <td style={cellStyle}>{a.ts}</td>
                      <td style={cellStyle}><code style={{ fontSize: '11px' }}>{JSON.stringify(a.details)}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const cellHeaderStyle: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  padding: '8px 12px',
}

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'top',
}

const refreshBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  padding: '4px 12px',
  borderRadius: '4px',
  fontSize: '12px',
  cursor: 'pointer',
}

const approveBtnStyle: React.CSSProperties = {
  background: '#22D3EE',
  color: '#0B1220',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '5px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  background: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid #22D3EE' : '2px solid transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
})
