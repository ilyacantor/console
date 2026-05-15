import { useEffect, useState } from 'react'
import { fetchCatalog, type CatalogPipe } from '../api/pipelines'

export default function PipelineCatalog() {
  const [pipes, setPipes] = useState<CatalogPipe[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchCatalog()
      .then((res) => { if (!cancelled) setPipes(res.pipes) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ padding: '16px 4px' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>Pipe Catalog</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
        Pipes discovered by AAM. Each row is one declared interface to a source system.
      </div>

      {error && (
        <div data-testid="catalog-error"
             style={{ color: '#F87171', padding: '12px', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '6px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
        <table data-testid="catalog-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              <th style={cellHeaderStyle}>Display Name</th>
              <th style={cellHeaderStyle}>Vendor</th>
              <th style={cellHeaderStyle}>Source System</th>
              <th style={cellHeaderStyle}>Fabric Plane</th>
              <th style={cellHeaderStyle}>Modality</th>
              <th style={cellHeaderStyle}>Identity Keys</th>
            </tr>
          </thead>
          <tbody>
            {pipes === null && !error && (
              <tr><td colSpan={6} style={{ padding: '14px', color: 'var(--text-muted)' }} data-testid="catalog-loading">Loading…</td></tr>
            )}
            {pipes !== null && pipes.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '14px', color: 'var(--text-muted)' }} data-testid="catalog-empty">No pipes discovered yet.</td></tr>
            )}
            {pipes !== null && pipes.map((p) => (
              <tr key={p.pipe_id} data-testid="catalog-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={cellStyle}>{p.display_name}</td>
                <td style={cellStyle}>{p.vendor}</td>
                <td style={cellStyle}>{p.source_system}</td>
                <td style={cellStyle}>{p.fabric_plane}</td>
                <td style={cellStyle}>{p.modality}</td>
                <td style={cellStyle}>
                  <code style={{ fontSize: '12px' }}>{p.identity_keys.join(', ')}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '12px' }} data-testid="catalog-count">
        {pipes !== null ? `${pipes.length} pipes` : ''}
      </div>
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
}
