import { useState } from 'react'

const LAYERS = [
  { id: 0, name: 'Identity & voice', desc: 'Mai persona, generalization charter, scope', loaded: 'Every invocation' },
  { id: 1, name: 'Scenario variants', desc: 'Page-aware framing, preset routing', loaded: 'Per agent invocation' },
  { id: 2, name: 'Observability grammar', desc: 'Run summary parsing, escalation criteria', loaded: 'Per query' },
  { id: 3, name: 'Quality gates', desc: 'Tier classification, supervised execution', loaded: 'Pre-execution' },
]

export default function Constitution() {
  const [activeLayer, setActiveLayer] = useState<number | null>(null)

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Constitution</h1>

      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Layers</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {LAYERS.map((layer) => (
            <div
              key={layer.id}
              onClick={() => setActiveLayer(activeLayer === layer.id ? null : layer.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                background: activeLayer === layer.id ? 'var(--bg-hover)' : 'var(--bg-surface)',
                borderRadius: '6px',
                border: '0.5px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', width: '60px', flexShrink: 0 }}>
                Layer {layer.id}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{layer.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{layer.loaded}</span>
            </div>
          ))}
        </div>
        {activeLayer !== null && (
          <div style={{ marginTop: '8px', padding: '10px 14px', fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '6px', border: '0.5px solid var(--border)' }}>
            {LAYERS.find((l) => l.id === activeLayer)?.desc}
          </div>
        )}
      </div>

      <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
        Constitution layers live in Platform under <code>app/mai/constitution/</code>. Editing available in a future release.
      </div>
    </div>
  )
}
