import { useEffect, useState } from 'react'
import {
  fetchDclTriplesOverview,
  fetchDclContextualizationSummary,
} from '../api/client'
import ModuleIframe from '../components/ModuleIframe'
import { useIdentity } from '../api/identity'

type Tab = 'coverage' | 'sources' | 'lineage'

const TABS: { key: Tab; label: string }[] = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'sources', label: 'Sources' },
  { key: 'lineage', label: 'Lineage' },
]

interface DomainInfo {
  domain: string
  triples: number
  concepts: number
  confidence: string
}

interface SourceInfo {
  source: string
  triples: number
  confidence: number
  last_updated: string | null
}

interface OverviewData {
  total_triples: number
  domains: DomainInfo[]
  sources: SourceInfo[]
  entity_breakdown: Record<string, number>
  pending_resolution: number
  total_resolution: number
}

const DCL_BASE = import.meta.env.VITE_DCL_URL || 'http://localhost:3004'

export default function Inspect() {
  const { identity } = useIdentity()
  const [tab, setTab] = useState<Tab>('lineage')
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const tenantId = identity?.tenant_id

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [overviewRaw, ctxRaw] = await Promise.all([
          fetchDclTriplesOverview(tenantId) as Promise<Record<string, unknown>>,
          fetchDclContextualizationSummary(tenantId) as Promise<Record<string, unknown>>,
        ])
        if (!cancelled) {
          setOverview(parseOverview(overviewRaw, ctxRaw))
          setOverviewError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setOverviewError(
            `DCL triples overview unavailable: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
      if (!cancelled) setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tenantId])

  const domainCount = overview?.domains.filter((d) => d.triples > 0).length ?? 0
  const totalDomains = overview?.domains.length ?? 0
  const totalTriples = overview?.total_triples ?? 0
  const sourceCount = overview?.sources.length ?? 0
  const pendingRes = overview?.pending_resolution ?? 0
  const totalRes = overview?.total_resolution ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: tab === t.key ? 600 : 400,
              border: '0.5px solid var(--border)',
              borderRadius: '8px',
              cursor: 'pointer',
              background: tab === t.key ? 'var(--bg-hover)' : 'transparent',
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loading && overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          <SummaryCard label="Domain coverage" value={`${domainCount} / ${totalDomains}`} />
          <SummaryCard
            label="Total triples"
            value={totalTriples.toLocaleString()}
            sub={entityBreakdownText(overview.entity_breakdown)}
          />
          <SummaryCard label="Source systems" value={String(sourceCount)} />
          <SummaryCard label="Pending resolution" value={`${pendingRes} / ${totalRes}`} />
        </div>
      )}

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '20px', textAlign: 'center' }}>
          Loading DCL data...
        </div>
      )}

      {overviewError && !loading && (
        <div
          style={{
            background: '#1A1520',
            border: '0.5px solid #3B2A50',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#A78BFA',
          }}
        >
          {overviewError}
        </div>
      )}

      {tab === 'coverage' && <CoverageTab domains={overview?.domains ?? []} />}
      {tab === 'sources' && <SourcesTab sources={overview?.sources ?? []} />}
      {tab === 'lineage' && <LineageTab />}
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function CoverageTab({ domains }: { domains: DomainInfo[] }) {
  if (domains.length === 0) {
    return <EmptyState message="No domain coverage data available." />
  }

  const maxTriples = Math.max(...domains.map((d) => d.triples), 1)
  const sorted = [...domains].sort((a, b) => b.triples - a.triples)

  const confidenceColor = (c: string) => {
    const lc = c.toLowerCase()
    if (lc === 'exact' || lc === 'high') return '#22C55E'
    if (lc === 'medium' || lc === 'partial') return '#F59E0B'
    return '#EF4444'
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Domain coverage</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thLeft}>Domain</th>
            <th style={thCenter}>Triples</th>
            <th style={thCenter}>Concepts</th>
            <th style={thCenter}>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.domain} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>{d.domain}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center', position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${(d.triples / maxTriples) * 100}%`,
                    background: 'rgba(96,165,250,0.08)',
                    pointerEvents: 'none',
                  }}
                />
                <span style={{ position: 'relative', fontFamily: 'monospace' }}>
                  {d.triples.toLocaleString()}
                </span>
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>{d.concepts}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                <span style={{ color: confidenceColor(d.confidence), fontWeight: 500 }}>
                  {d.confidence}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SourcesTab({ sources }: { sources: SourceInfo[] }) {
  if (sources.length === 0) {
    return <EmptyState message="No source data available." />
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Source systems</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thLeft}>Source</th>
            <th style={thCenter}>Triples</th>
            <th style={thCenter}>Confidence</th>
            <th style={thCenter}>Last updated</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.source} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>{s.source}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace' }}>
                {s.triples.toLocaleString()}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace' }}>
                {s.confidence.toFixed(2)}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>{freshnessPill(s.last_updated)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LineageTab() {
  return (
    <div style={cardStyle}>
      <ModuleIframe
        serviceName="DCL"
        baseUrl={DCL_BASE}
        title="DCL Lineage"
        entityParam={false}
        minHeight="500px"
        height="calc(100vh - 280px)"
      />
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        ...cardStyle,
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '12px',
        padding: '40px',
      }}
    >
      {message}
    </div>
  )
}

function confidenceTier(avg: number): string {
  if (avg >= 0.9) return 'high'
  if (avg >= 0.7) return 'medium'
  return 'low'
}

function parseOverview(
  overview: Record<string, unknown>,
  ctx: Record<string, unknown>,
): OverviewData {
  const domains: DomainInfo[] = []
  const sources: SourceInfo[] = []

  const ctxDomains = (ctx.domains ?? []) as Record<string, unknown>[]
  if (Array.isArray(ctxDomains)) {
    for (const d of ctxDomains) {
      domains.push({
        domain: String(d.domain ?? ''),
        triples: Number(d.triple_count ?? 0),
        concepts: Number(d.concepts_used ?? 0),
        confidence: confidenceTier(Number(d.avg_confidence ?? 0)),
      })
    }
  }

  const ctxSources = (ctx.sources ?? []) as Record<string, unknown>[]
  if (Array.isArray(ctxSources)) {
    for (const s of ctxSources) {
      sources.push({
        source: String(s.source_system ?? ''),
        triples: Number(s.triple_count ?? 0),
        confidence: Number(s.avg_confidence ?? 0),
        last_updated: null,
      })
    }
  }

  const entityBreakdown: Record<string, number> = {}
  const rawEntities = overview.entities
  if (Array.isArray(rawEntities)) {
    for (const e of rawEntities as Record<string, unknown>[]) {
      const name = String(e.display_name ?? e.entity_id ?? '')
      const count = Number(e.triple_count ?? 0)
      if (name) entityBreakdown[name] = count
    }
  }

  return {
    total_triples: Number(overview.total_triples ?? 0),
    domains,
    sources,
    entity_breakdown: entityBreakdown,
    pending_resolution: Number(overview.conflict_count ?? 0),
    total_resolution: Number(overview.conflict_count ?? 0),
  }
}

function entityBreakdownText(breakdown: Record<string, number>): string | undefined {
  const entries = Object.entries(breakdown)
  if (entries.length === 0) return undefined
  return entries.map(([name, count]) => `${name}: ${count.toLocaleString()}`).join(' · ')
}

function freshnessPill(updated: string | null): React.ReactNode {
  if (!updated) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <span style={{ color: 'var(--text-secondary)' }}>{updated}</span>
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '0.5px solid var(--border)',
  borderRadius: '12px',
  padding: '14px',
}

const thLeft: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
}

const thCenter: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'center',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
}

const pillBase: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: '4px',
  fontSize: '10px',
  fontWeight: 600,
}

// Suppress unused warning for pillBase (kept for future tab additions).
void pillBase
