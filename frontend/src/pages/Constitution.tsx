import { useState } from 'react'

interface PolicyDoc {
  entity: string
  role: string
  sections: string[]
  elections: string[]
}

const LAYERS = [
  { id: 0, name: 'Accounting Axioms', desc: 'DR=CR, element boundaries, articulation rules', loaded: 'Every invocation' },
  { id: 1, name: 'P&L / BS Constitution', desc: 'Temporal/flow logic, combining, rev rec delegation', loaded: 'Per agent invocation' },
  { id: 2, name: 'COFA Ontology', desc: 'Entity resolution rules, match taxonomy, conflict register', loaded: 'Convergence engagements' },
  { id: 3, name: 'Entity Policies', desc: 'Per-entity scope, rules, boundaries, explicit gaps', loaded: 'Per engagement' },
  { id: 4, name: 'Industry Profiles', desc: 'SaaS, Manufacturing. CoA expectations, KPIs', loaded: 'Per entity industry' },
]

const POLICIES: PolicyDoc[] = [
  {
    entity: 'Meridian',
    role: 'Acquirer',
    sections: ['Revenue recognition', 'COGS', 'OpEx', 'D&A', 'BS policies', 'Explicit Gaps'],
    elections: [
      'Gross revenue recognition',
      'Benefits in OpEx (not COGS)',
      'Recruiting expensed immediately',
      'R&D expensed below $10M threshold',
      'Straight-line depreciation',
    ],
  },
  {
    entity: 'Cascadia',
    role: 'Target',
    sections: ['Revenue recognition', 'COGS', 'OpEx', 'Capitalization', 'D&A', 'BS policies', 'Explicit Gaps'],
    elections: [
      'Net revenue recognition',
      'Benefits in COGS for delivery staff',
      'Recruiting capitalized above $50K/hire',
      'Automation capitalized above $2M/project',
      'Accelerated depreciation for delivery equipment',
    ],
  },
]

export default function Constitution() {
  const [activeLayer, setActiveLayer] = useState<number | null>(null)

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Constitution</h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, background: '#DCFCE7', color: '#166534', borderRadius: '4px', padding: '2px 8px' }}>
          COFA truth test: STRONG PASS
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>6/6 conflicts, 100% completeness, $1.49/engagement</span>
      </div>

      {/* Constitution layers */}
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
                {layer.id === 5 ? 'Orch.' : `Layer ${layer.id}`}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{layer.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{layer.loaded}</span>
            </div>
          ))}
          <div
            onClick={() => setActiveLayer(activeLayer === 5 ? null : 5)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              background: activeLayer === 5 ? 'var(--bg-hover)' : 'var(--bg-surface)',
              borderRadius: '6px',
              border: '0.5px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', width: '60px', flexShrink: 0 }}>Orch.</span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>Orchestrator</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Wraps all invocations</span>
          </div>
        </div>
      </div>

      {/* Layer 3 entity policies — the key per-engagement content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {POLICIES.map((policy) => (
          <div key={policy.entity} style={{ padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{policy.entity}</span>
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px',
                background: policy.role === 'Acquirer' ? '#DBEAFE' : '#FEF9C3',
                color: policy.role === 'Acquirer' ? '#1E40AF' : '#854D0E',
              }}>
                {policy.role}
              </span>
            </div>

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Policy sections</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
              {policy.sections.map((s) => (
                <span key={s} style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '3px', background: 'var(--bg)', border: '0.5px solid var(--border)', color: 'var(--text-secondary)' }}>
                  {s}
                </span>
              ))}
            </div>

            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Key elections</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {policy.elections.map((e) => (
                <div key={e} style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'flex', gap: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>&bull;</span>
                  <span>{e}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
        Entity policies are manually authored markdown files in Platform. Editing available in a future release.
      </div>
    </div>
  )
}
