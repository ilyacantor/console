import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchDclTriplesOverview,
  fetchDclCofaAdjustments,
} from '../api/client'
import { type CofaMergeRow, SEED_COFA_MERGE } from '../data/deal-seed'
import ModuleIframe from '../components/ModuleIframe'

type Tab = 'coverage' | 'sources' | 'lineage' | 'cofa'

const TABS: { key: Tab; label: string }[] = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'sources', label: 'Sources' },
  { key: 'lineage', label: 'Lineage' },
  { key: 'cofa', label: 'COFA merge' },
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
  const [tab, setTab] = useState<Tab>('coverage')
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [cofaRows, setCofaRows] = useState<CofaMergeRow[] | null>(null)
  const [cofaError, setCofaError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      // Load triples overview
      try {
        const raw = (await fetchDclTriplesOverview()) as Record<string, unknown>
        if (!cancelled) {
          setOverview(parseOverview(raw))
          setOverviewError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setOverviewError(
            `DCL triples overview unavailable: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }

      // Load COFA data
      try {
        const raw = (await fetchDclCofaAdjustments()) as Record<string, unknown>
        if (!cancelled) {
          const parsed = parseCofaRows(raw)
          setCofaRows(parsed.length > 0 ? parsed : null)
          setCofaError(parsed.length === 0 ? 'No COFA data returned from DCL.' : null)
        }
      } catch (err) {
        if (!cancelled) {
          setCofaError(
            `DCL COFA endpoint unavailable: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }

      if (!cancelled) setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const domainCount = overview?.domains.filter((d) => d.triples > 0).length ?? 0
  const totalDomains = overview?.domains.length ?? 0
  const totalTriples = overview?.total_triples ?? 0
  const sourceCount = overview?.sources.length ?? 0
  const pendingRes = overview?.pending_resolution ?? 0
  const totalRes = overview?.total_resolution ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Tab bar */}
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

      {/* Summary cards */}
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

      {/* Tab content */}
      {tab === 'coverage' && <CoverageTab domains={overview?.domains ?? []} />}
      {tab === 'sources' && <SourcesTab sources={overview?.sources ?? []} />}
      {tab === 'lineage' && <LineageTab />}
      {tab === 'cofa' && <CofaTab rows={cofaRows} error={cofaError} />}
    </div>
  )
}

/* --- Summary card --- */

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

/* --- Coverage tab --- */

function CoverageTab({ domains }: { domains: DomainInfo[] }) {
  if (domains.length === 0) {
    return <EmptyState message="No domain coverage data available." />
  }

  const maxTriples = Math.max(...domains.map((d) => d.triples), 1)
  const sorted = [...domains].sort((a, b) => b.triples - a.triples)

  const confidenceColor = (c: string) => {
    const lc = c.toLowerCase()
    if (lc === 'exact' || lc === 'high') return '#22C55E'
    if (lc === 'medium') return '#F59E0B'
    if (lc === 'low') return '#EF4444'
    return '#3B82F6'
  }

  return (
    <div style={cardStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thLeft}>Domain</th>
            <th style={{ ...thLeft, width: '30%' }}></th>
            <th style={thRight}>Triples</th>
            <th style={thRight}>Concepts</th>
            <th style={thCenter}>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.domain} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{d.domain}</td>
              <td style={{ padding: '6px 8px' }}>
                <div
                  style={{
                    height: '6px',
                    background: 'var(--bg-hover)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(d.triples / maxTriples) * 100}%`,
                      background: '#3B82F6',
                      borderRadius: '3px',
                    }}
                  />
                </div>
              </td>
              <td style={monoRight}>{d.triples.toLocaleString()}</td>
              <td style={monoRight}>{d.concepts.toLocaleString()}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: confidenceColor(d.confidence),
                  }}
                  title={d.confidence}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* --- Sources tab --- */

function SourcesTab({ sources }: { sources: SourceInfo[] }) {
  if (sources.length === 0) {
    return <EmptyState message="No source system data available." />
  }

  const sorted = [...sources].sort((a, b) => b.triples - a.triples)

  function freshnessPill(lastUpdated: string | null) {
    if (!lastUpdated) {
      return <span style={{ ...pillBase, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>unknown</span>
    }
    const hoursAgo = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60)
    if (hoursAgo < 24) {
      return (
        <span style={{ ...pillBase, background: '#14332A', color: '#4ADE80' }}>
          {Math.round(hoursAgo)}h ago
        </span>
      )
    }
    if (hoursAgo < 72) {
      return <span style={{ ...pillBase, background: '#332B15', color: '#F59E0B' }}>stale</span>
    }
    return (
      <span style={{ ...pillBase, background: '#2A1515', color: '#FCA5A5' }}>
        {Math.round(hoursAgo)}h stale
      </span>
    )
  }

  return (
    <div style={cardStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thLeft}>Source</th>
            <th style={thRight}>Triples</th>
            <th style={thRight}>Confidence</th>
            <th style={thCenter}>Freshness</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.source} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{s.source}</td>
              <td style={monoRight}>{s.triples.toLocaleString()}</td>
              <td style={monoRight}>{s.confidence.toFixed(2)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>{freshnessPill(s.last_updated)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* --- Lineage tab --- */

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

/* --- COFA merge tab --- */

function CofaTab({ rows, error }: { rows: CofaMergeRow[] | null; error: string | null }) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const displayRows = rows ?? SEED_COFA_MERGE
  const usingSeed = !rows

  const matchColors: Record<string, { bg: string; color: string }> = {
    exact: { bg: '#14332A', color: '#4ADE80' },
    semantic: { bg: '#1A2A47', color: '#60A5FA' },
    manual: { bg: '#332B15', color: '#F59E0B' },
    conflict: { bg: '#2A1515', color: '#FCA5A5' },
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>COFA merge</h2>
        <span style={{ ...pillBase, background: '#1A2A47', color: '#60A5FA' }}>Meridian</span>
        <span style={{ ...pillBase, background: '#332B15', color: '#F59E0B' }}>Cascadia</span>
      </div>

      {error && usingSeed && (
        <div
          style={{
            fontSize: '11px',
            color: '#A78BFA',
            background: '#1A1520',
            border: '0.5px solid #3B2A50',
            borderRadius: '6px',
            padding: '6px 10px',
            marginBottom: '10px',
          }}
        >
          {error} Showing seed data.
        </div>
      )}

      {!rows && !error && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginBottom: '10px',
          }}
        >
          No COFA data available. Run ME pipeline to generate.
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thLeft}>Unified account</th>
            <th style={thLeft}>Meridian account</th>
            <th style={thLeft}>Cascadia account</th>
            <th style={thCenter}>Match type</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((r, i) => (
            <>
              <tr
                key={r.unified_account}
                onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.unified_account}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{r.meridian_account}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{r.cascadia_account}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  <span
                    style={{
                      ...pillBase,
                      background: matchColors[r.match_type]?.bg ?? 'var(--bg-hover)',
                      color: matchColors[r.match_type]?.color ?? 'var(--text-muted)',
                    }}
                  >
                    {r.match_type}
                  </span>
                </td>
              </tr>
              {expandedRow === i && (
                <tr key={`${r.unified_account}-detail`}>
                  <td
                    colSpan={4}
                    style={{
                      padding: '8px 14px 8px 24px',
                      background: 'var(--bg-hover)',
                      fontSize: '11px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '24px', color: 'var(--text-secondary)' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Confidence: </span>
                        <span style={{ fontFamily: 'monospace' }}>{r.confidence.toFixed(2)}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Basis: </span>
                        {r.mapping_basis}
                      </div>
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>{r.match_reasoning}</div>
                    {r.conflict_id && (
                      <div style={{ marginTop: '4px' }}>
                        <Link
                          to="/deal"
                          style={{ color: '#3B82F6', fontSize: '11px', textDecoration: 'none' }}
                        >
                          Deal &gt; Conflicts
                        </Link>
                        <span style={{ color: 'var(--text-muted)' }}> for resolution</span>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>
        Conflicts link to{' '}
        <Link to="/deal" style={{ color: '#3B82F6', textDecoration: 'none' }}>
          Deal &gt; Conflicts
        </Link>{' '}
        for resolution.
      </div>
    </div>
  )
}

/* --- Empty state --- */

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

/* --- Parsing helpers --- */

function parseOverview(raw: Record<string, unknown>): OverviewData {
  const domains: DomainInfo[] = []
  const sources: SourceInfo[] = []

  // Parse domains from various possible shapes
  const rawDomains = (raw.domain_breakdown ?? raw.domains ?? []) as Record<string, unknown>[]
  if (Array.isArray(rawDomains)) {
    for (const d of rawDomains) {
      domains.push({
        domain: String(d.domain ?? d.name ?? ''),
        triples: Number(d.triples ?? d.triple_count ?? d.count ?? 0),
        concepts: Number(d.concepts ?? d.concept_count ?? 0),
        confidence: String(d.confidence ?? d.confidence_tier ?? 'medium'),
      })
    }
  }

  // Parse sources
  const rawSources = (raw.source_breakdown ?? raw.sources ?? []) as Record<string, unknown>[]
  if (Array.isArray(rawSources)) {
    for (const s of rawSources) {
      sources.push({
        source: String(s.source ?? s.name ?? s.source_system ?? ''),
        triples: Number(s.triples ?? s.triple_count ?? s.count ?? 0),
        confidence: Number(s.confidence ?? s.avg_confidence ?? 0.85),
        last_updated: (s.last_updated ?? s.updated_at ?? null) as string | null,
      })
    }
  }

  // Parse entity breakdown
  const entityBreakdown: Record<string, number> = {}
  const rawEntities = (raw.entity_breakdown ?? raw.entities ?? {}) as Record<string, unknown>
  if (typeof rawEntities === 'object' && rawEntities !== null) {
    for (const [k, v] of Object.entries(rawEntities)) {
      entityBreakdown[k] = Number(v)
    }
  }

  return {
    total_triples: Number(raw.total_triples ?? raw.count ?? 0),
    domains,
    sources,
    entity_breakdown: entityBreakdown,
    pending_resolution: Number(raw.pending_resolution ?? raw.conflict_count ?? 0),
    total_resolution: Number(raw.total_resolution ?? raw.total_conflicts ?? raw.conflict_count ?? 0),
  }
}

function parseCofaRows(raw: Record<string, unknown>): CofaMergeRow[] {
  const rows: CofaMergeRow[] = []
  const items = (raw.adjustments ?? raw.mappings ?? raw.rows ?? []) as Record<string, unknown>[]
  if (!Array.isArray(items)) return rows

  for (const item of items) {
    rows.push({
      unified_account: String(item.unified_account ?? item.account ?? ''),
      meridian_account: String(item.meridian_account ?? item.acquirer_account ?? '—'),
      cascadia_account: String(item.cascadia_account ?? item.target_account ?? '—'),
      match_type: (item.match_type ?? item.type ?? 'semantic') as CofaMergeRow['match_type'],
      confidence: Number(item.confidence ?? 0.85),
      mapping_basis: String(item.mapping_basis ?? item.basis ?? ''),
      match_reasoning: String(item.match_reasoning ?? item.reasoning ?? ''),
      conflict_id: (item.conflict_id ?? null) as string | null,
    })
  }
  return rows
}

function entityBreakdownText(breakdown: Record<string, number>): string {
  const entries = Object.entries(breakdown)
  if (entries.length === 0) return ''
  return entries.map(([k, v]) => `${k}: ${v.toLocaleString()}`).join(' • ')
}

/* --- Shared styles --- */

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '0.5px solid var(--border)',
  borderRadius: '12px',
  padding: '14px',
}

const pillBase: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '10px',
  padding: '2px 7px',
  borderRadius: '8px',
  fontWeight: 600,
}

const thLeft: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textAlign: 'left',
}

const thRight: React.CSSProperties = {
  ...thLeft,
  textAlign: 'right',
}

const thCenter: React.CSSProperties = {
  ...thLeft,
  textAlign: 'center',
}

const monoRight: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'right',
  fontFamily: 'monospace',
  fontSize: '11px',
}
