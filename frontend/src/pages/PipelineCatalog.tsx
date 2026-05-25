import { useEffect, useState } from 'react'
import { fetchCatalog, type CatalogPipe } from '../api/pipelines'
import { useEnvSnapshot } from '../hooks/useEnvSnapshot'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'
import {
  MCP_VENDOR_SERVERS,
  pipesAtStage,
  type SeedPipe,
} from '../demo/seed'

function pipeFromSeed(p: SeedPipe): CatalogPipe {
  return {
    pipe_id: p.pipe_id,
    display_name: p.display_name,
    vendor: p.vendor,
    source_system: p.source_system,
    fabric_plane: p.fabric_plane,
    modality: p.modality,
    identity_keys: p.identity_keys,
  }
}

export default function PipelineCatalog() {
  const snapshot = useEnvSnapshot()
  const [pipes, setPipes] = useState<CatalogPipe[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Seed-mode counts for the summary strip + Mai surface state.
  const seedCounts = snapshot ? pipesAtStage(snapshot) : null
  const fabricPipes = (pipes ?? []).filter((p) => p.fabric_plane !== 'Direct')
  const directPipes = (pipes ?? []).filter((p) => p.fabric_plane === 'Direct')

  useSurfaceExtras('page:catalog', {
    visible_panels: snapshot
      ? ['Pipe Catalog', 'Direct connections', 'MCP servers']
      : ['Pipe Catalog'],
    extra: {
      page: 'catalog',
      pipes_visible: pipes?.length ?? 0,
      fabric_count_total: seedCounts?.fabric_count ?? null,
      direct_count_total: seedCounts?.direct_count ?? null,
      data_source: snapshot ? 'tour-snapshot' : 'live-aam',
    },
  })

  useEffect(() => {
    let cancelled = false
    setError(null)

    if (snapshot) {
      // Tour-snapshot mode: bypass the live AAM call and render the seed.
      const seed = pipesAtStage(snapshot)
      setPipes(seed.visible.map(pipeFromSeed))
      return () => { cancelled = true }
    }

    fetchCatalog()
      .then((res) => { if (!cancelled) setPipes(res.pipes) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [snapshot])

  return (
    <div style={{ padding: '16px 4px' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>Pipe Catalog</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
        Pipes discovered by AAM. Each row is one declared interface to a source system.
      </div>

      {snapshot && seedCounts && (
        <div
          data-testid="catalog-seed-summary"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <SummaryCard label="Fabric pipes" value={String(seedCounts.fabric_count)} />
          <SummaryCard label="Direct connections" value={String(seedCounts.direct_count)} />
          <SummaryCard label="MCP servers (vendor-provided)" value={String(MCP_VENDOR_SERVERS.length)} />
        </div>
      )}

      {snapshot && (
        <div
          data-testid="catalog-mcp-strip"
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 14,
            padding: '10px 12px',
            border: '0.5px solid var(--border)',
            background: 'var(--bg-card)',
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>
            MCP from vendors:
          </span>
          {MCP_VENDOR_SERVERS.map((m) => (
            <span
              key={m.vendor}
              data-testid="mcp-server-callout"
              data-vendor={m.vendor}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                background: 'rgba(167,139,250,0.18)',
                color: '#A78BFA',
                borderRadius: 4,
              }}
            >
              {m.server_label} · {m.kind}
            </span>
          ))}
        </div>
      )}

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
            {pipes !== null && fabricPipes.length === 0 && !snapshot && (
              <tr><td colSpan={6} style={{ padding: '14px', color: 'var(--text-muted)' }} data-testid="catalog-empty">No pipes discovered yet.</td></tr>
            )}
            {pipes !== null && fabricPipes.map((p) => (
              <tr
                key={p.pipe_id}
                data-testid="catalog-row"
                data-fabric-plane={p.fabric_plane}
                style={{ borderBottom: '1px solid var(--border)' }}
              >
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

      {snapshot && directPipes.length > 0 && (
        <div
          data-testid="direct-connect-panel"
          style={{
            marginTop: 16,
            border: '0.5px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            background: 'var(--bg-card)',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
            Direct connections (non-fabric)
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
            Systems that don't ride MuleSoft / Apigee / Kafka / Snowflake. AOS attaches to them directly.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>System</th>
                <th style={{ padding: '4px 8px' }}>Modality</th>
                <th style={{ padding: '4px 8px' }}>Identity</th>
              </tr>
            </thead>
            <tbody>
              {directPipes.map((p) => (
                <tr
                  key={p.pipe_id}
                  data-testid="direct-connect-row"
                  data-pipe-id={p.pipe_id}
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <td style={{ padding: '4px 8px' }}>{p.display_name}</td>
                  <td style={{ padding: '4px 8px' }}>{p.modality}</td>
                  <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{p.identity_keys.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '0.5px solid var(--border)',
        borderRadius: '10px',
        padding: '12px',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>{value}</div>
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
