import { useEffect, useState } from 'react'
import { approveMapping, fetchMappings, type MappingPack } from '../api/pipelines'

function pillStyle(tier: 'auto' | 'review' | 'low'): React.CSSProperties {
  if (tier === 'auto') return { background: 'rgba(34,197,94,0.18)', color: '#86EFAC' }
  if (tier === 'review') return { background: 'rgba(245,158,11,0.22)', color: '#FCD34D' }
  return { background: 'rgba(239,68,68,0.22)', color: '#FCA5A5' }
}

export default function PipelineMappings() {
  const [packs, setPacks] = useState<MappingPack[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const load = async () => {
    setError(null)
    try {
      const res = await fetchMappings()
      setPacks(res.packs)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => { load() }, [])

  const onApprove = async (packKey: string, field: string) => {
    const key = `${packKey}::${field}`
    setPending(key)
    try {
      await approveMapping(packKey, field, true)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(null)
    }
  }

  const onRevoke = async (packKey: string, field: string) => {
    const key = `${packKey}::${field}`
    setPending(key)
    try {
      await approveMapping(packKey, field, false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(null)
    }
  }

  return (
    <div style={{ padding: '16px 4px' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>Semantic Mapping</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
        Raw source fields mapped to AOS concept.property. Auto-applied at ≥90%; mid-confidence rows wait for a click.
      </div>

      {error && (
        <div data-testid="mappings-error"
             style={{ color: '#F87171', padding: '12px', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '6px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {packs === null && !error && <div data-testid="mappings-loading" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
      {packs !== null && packs.length === 0 && <div data-testid="mappings-empty" style={{ color: 'var(--text-muted)' }}>No mapping packs found.</div>}

      {packs !== null && packs.map((p) => (
        <div key={p.pack_key}
             data-testid="mappings-pack"
             data-pack-key={p.pack_key}
             style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '12px', marginBottom: '14px' }}>
          <div data-testid="mappings-pack-name" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
            {p.display_name}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={cellHeaderStyle}>Source Field</th>
                <th style={cellHeaderStyle}>Concept</th>
                <th style={cellHeaderStyle}>Property</th>
                <th style={cellHeaderStyle}>Confidence</th>
                <th style={cellHeaderStyle}>Status</th>
                <th style={cellHeaderStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {p.fields.map((f) => {
                const key = `${p.pack_key}::${f.source_field}`
                const status = f.tier === 'auto' ? 'Auto-applied' : f.approved ? 'Approved' : 'Needs review'
                return (
                  <tr key={key} data-testid={`mappings-field-${f.source_field}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={cellStyle}><code style={{ fontSize: '12px' }}>{f.source_field}</code></td>
                    <td style={cellStyle}>{f.concept}</td>
                    <td style={cellStyle}>{f.property}</td>
                    <td style={cellStyle}>
                      <span data-testid="mappings-confidence-pill"
                            style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '12px', ...pillStyle(f.tier) }}>
                        {Math.round(f.confidence * 100)}%
                      </span>
                    </td>
                    <td style={cellStyle} data-testid="mappings-status">{status}</td>
                    <td style={cellStyle}>
                      {f.needs_click ? (
                        <button data-testid="mappings-approve-btn"
                                disabled={pending === key}
                                onClick={() => onApprove(p.pack_key, f.source_field)}
                                style={btnStyle}>
                          {pending === key ? 'Confirming…' : 'Confirm mapping'}
                        </button>
                      ) : f.approved ? (
                        <button data-testid="mappings-revoke-btn"
                                disabled={pending === key}
                                onClick={() => onRevoke(p.pack_key, f.source_field)}
                                style={revokeBtnStyle}>
                          {pending === key ? 'Reverting…' : 'Un-confirm'}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{f.rationale}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
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
  padding: '8px 10px',
}

const cellStyle: React.CSSProperties = {
  padding: '7px 10px',
  verticalAlign: 'top',
}

const btnStyle: React.CSSProperties = {
  background: '#22D3EE',
  color: '#0B1220',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '5px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
}

const revokeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
  padding: '5px 11px',
  borderRadius: '5px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
}
