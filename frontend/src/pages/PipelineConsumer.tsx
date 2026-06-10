import { useState } from 'react'
import {
  consumerProvenance,
  consumerQuery,
  type ConsumerTriple,
  type ProvenanceSource,
} from '../api/pipelines'

const TENANT_ID = import.meta.env.VITE_AOS_TENANT_ID || ''

export default function PipelineConsumer() {
  const [tenantId, setTenantId] = useState<string>(TENANT_ID)
  const [domain, setDomain] = useState<string>('')
  const [concept, setConcept] = useState<string>('')
  const [entityId, setEntityId] = useState<string>('')
  const [triples, setTriples] = useState<ConsumerTriple[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const [drillFor, setDrillFor] = useState<ConsumerTriple | null>(null)
  const [drillSources, setDrillSources] = useState<ProvenanceSource[] | null>(null)
  const [drillError, setDrillError] = useState<string | null>(null)
  const [drilling, setDrilling] = useState(false)

  const onQuery = async () => {
    setError(null)
    setTriples(null)
    if (!tenantId) {
      setError('tenant_id is required (I2 — no silent fallback).')
      return
    }
    if (!domain && !concept) {
      setError('Enter a domain or concept to query.')
      return
    }
    setRunning(true)
    try {
      const res = await consumerQuery({
        tenant_id: tenantId,
        domain: domain || undefined,
        concept: concept || undefined,
        entity_id: entityId || undefined,
        limit: 25,
      })
      const list = (res.triples as ConsumerTriple[]) || []
      setTriples(list)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const onDrill = async (t: ConsumerTriple) => {
    setDrillFor(t)
    setDrillSources(null)
    setDrillError(null)
    setDrilling(true)
    try {
      // Query rows expose the exact row id as triple_id (DCL returns both id
      // and triple_id); drilling by id is exact. The composite fallback now
      // carries property too — (concept, entity, period) alone is ambiguous
      // across a concept's properties.
      const exactId =
        (typeof t.triple_id === 'string' && t.triple_id) ||
        (typeof t.id === 'string' && t.id) ||
        undefined
      const res = await consumerProvenance({
        tenant_id: tenantId,
        triple_id: exactId,
        concept: typeof t.concept === 'string' ? t.concept : undefined,
        property: typeof t.property === 'string' ? t.property : undefined,
        entity_id: typeof t.entity_id === 'string' ? t.entity_id : undefined,
        period: typeof t.period === 'string' ? t.period : undefined,
      })
      const list = (res.sources as ProvenanceSource[]) || []
      setDrillSources(list)
    } catch (e) {
      setDrillError((e as Error).message)
    } finally {
      setDrilling(false)
    }
  }

  return (
    <div style={{ padding: '16px 4px' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>Consumer Drill-Through</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
        Console calls DCL over MCP. Pick a domain or concept; results render with a drill button that calls the <code>provenance</code> tool.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <label style={labelStyle}>Tenant:</label>
        <input data-testid="consumer-tenant-input"
               value={tenantId} onChange={(e) => setTenantId(e.target.value)}
               placeholder="tenant_id (UUID)"
               style={inputStyle} />
        <label style={labelStyle}>Entity:</label>
        <input data-testid="consumer-entity-input"
               value={entityId} onChange={(e) => setEntityId(e.target.value)}
               placeholder="entity_id (optional)"
               style={inputStyle} />
        <label style={labelStyle}>Domain:</label>
        <input data-testid="consumer-domain-input"
               value={domain} onChange={(e) => setDomain(e.target.value)}
               placeholder="domain (e.g. cloud_spend)"
               style={inputStyle} />
        <label style={labelStyle}>Concept:</label>
        <input data-testid="consumer-concept-input"
               value={concept} onChange={(e) => setConcept(e.target.value)}
               placeholder="concept (e.g. cloud_spend.cost_usd)"
               style={inputStyle} />
      </div>

      <button data-testid="consumer-query-btn" onClick={onQuery} disabled={running} style={primaryBtnStyle}>
        {running ? 'Running…' : 'Run query'}
      </button>

      {error && (
        <div data-testid="consumer-error"
             style={{ color: '#F87171', padding: '12px', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '6px', marginTop: '12px' }}>
          {error}
        </div>
      )}

      {triples !== null && triples.length === 0 && !error && (
        <div data-testid="consumer-empty" style={{ color: 'var(--text-muted)', marginTop: '12px' }}>No triples returned for that query.</div>
      )}

      {triples !== null && triples.length > 0 && (
        <table data-testid="consumer-results-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '14px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)' }}>
              <th style={cellHeaderStyle}>Concept</th>
              <th style={cellHeaderStyle}>Entity</th>
              <th style={cellHeaderStyle}>Period</th>
              <th style={cellHeaderStyle}>Value</th>
              <th style={cellHeaderStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {triples.map((t, i) => (
              <tr key={String(t.triple_id || i)} data-testid="consumer-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={cellStyle}>{String(t.concept || '')}</td>
                <td style={cellStyle}>{String(t.entity_id || '')}</td>
                <td style={cellStyle}>{String(t.period || '')}</td>
                <td style={cellStyle} data-testid="consumer-value">
                  <code style={{ fontSize: '12px' }}>{JSON.stringify(t.value)}</code>
                </td>
                <td style={cellStyle}>
                  <button data-testid="consumer-drill-btn" onClick={() => onDrill(t)} style={drillBtnStyle}>
                    Drill
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drillFor && (
        <div data-testid="consumer-drill-panel" style={{ marginTop: '16px', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
            Provenance — {String(drillFor.concept)} / {String(drillFor.entity_id)}
          </div>
          {drilling && <div style={{ color: 'var(--text-muted)' }}>Calling DCL provenance tool…</div>}
          {drillError && <div data-testid="consumer-drill-error" style={{ color: '#F87171' }}>{drillError}</div>}
          {drillSources !== null && drillSources.length === 0 && (
            <div data-testid="consumer-drill-empty" style={{ color: 'var(--text-muted)' }}>No source rows returned.</div>
          )}
          {drillSources !== null && drillSources.length > 0 && (
            <table data-testid="consumer-drill-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  <th style={cellHeaderStyle}>Source System</th>
                  <th style={cellHeaderStyle}>Source Field</th>
                  <th style={cellHeaderStyle}>Pipe</th>
                  <th style={cellHeaderStyle}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {drillSources.map((s, i) => (
                  <tr key={i} data-testid="consumer-drill-row" style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={cellStyle} data-testid="consumer-drill-source-system">{s.source_system}</td>
                    <td style={cellStyle} data-testid="consumer-drill-source-field">{s.source_field}</td>
                    <td style={cellStyle}><code style={{ fontSize: '11px' }}>{s.pipe_id}</code></td>
                    <td style={cellStyle}>{Math.round((s.confidence_score || 0) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)',
  padding: '5px 8px', borderRadius: '4px', fontSize: '12px', minWidth: '200px',
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

const primaryBtnStyle: React.CSSProperties = {
  background: '#22D3EE',
  color: '#0B1220',
  border: 'none',
  padding: '7px 14px',
  borderRadius: '5px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
}

const drillBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#22D3EE',
  border: '1px solid #22D3EE',
  padding: '4px 10px',
  borderRadius: '4px',
  fontSize: '12px',
  cursor: 'pointer',
}
