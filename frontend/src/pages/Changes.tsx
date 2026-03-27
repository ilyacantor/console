import { useCallback, useEffect, useState } from 'react'
import {
  fetchChanges,
  fetchChangeSummary,
  acknowledgeChange,
  type ChangeEvent,
  type ChangeSummary,
} from '../api/client'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
}

const SEVERITY_PILL_BG: Record<string, string> = {
  critical: '#2A1515',
  warning: '#332B15',
  info: '#1A2A47',
}

const SEVERITY_PILL_FG: Record<string, string> = {
  critical: '#FCA5A5',
  warning: '#F59E0B',
  info: '#60A5FA',
}

const MODULE_COLORS: Record<string, string> = {
  aod: '#3B82F6',
  aam: '#F59E0B',
  dcl: '#7C3AED',
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const datePart = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  if (d.toDateString() === today.toDateString()) return `Today, ${datePart}`
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${datePart}`
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '0.5px solid var(--border)',
  borderRadius: '12px',
  padding: '14px',
}

const filterBtnStyle = (active: boolean, color?: string): React.CSSProperties => ({
  fontSize: '12px',
  padding: '5px 14px',
  borderRadius: '8px',
  border: '0.5px solid var(--border)',
  background: active ? (color || '#3B82F6') : 'transparent',
  color: active ? '#fff' : 'var(--text-secondary)',
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
})

export default function Changes() {
  const [events, setEvents] = useState<ChangeEvent[]>([])
  const [summary, setSummary] = useState<ChangeSummary | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string | null>(null)
  const [moduleFilters, setModuleFilters] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const params: Record<string, string | number> = {}
      if (severityFilter) params.severity = severityFilter
      const moduleArr = Array.from(moduleFilters)
      if (moduleArr.length === 1) params.module = moduleArr[0]!

      const [evResp, sumResp] = await Promise.all([
        fetchChanges(params),
        fetchChangeSummary(),
      ])

      let filtered = evResp.events
      if (moduleArr.length > 1) {
        filtered = filtered.filter((e) => moduleFilters.has(e.source_module))
      }
      setEvents(filtered)
      setSummary(sumResp)
    } catch {
      // non-critical — keep existing data
    }
  }, [severityFilter, moduleFilters])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [load])

  const handleAck = async (id: string) => {
    try {
      await acknowledgeChange(id)
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, acknowledged: true } : e)),
      )
    } catch {
      // ignore
    }
  }

  const toggleModule = (m: string) => {
    setModuleFilters((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  // Group events by date
  const grouped: { date: string; items: ChangeEvent[] }[] = []
  let currentDate = ''
  for (const ev of events) {
    const d = formatDate(ev.timestamp)
    if (d !== currentDate) {
      currentDate = d
      grouped.push({ date: d, items: [] })
    }
    grouped[grouped.length - 1]!.items.push(ev)
  }

  let sinceText = '24h ago'
  const oldestEv = events.length > 0 ? events[events.length - 1] : undefined
  if (oldestEv) {
    const absTime = new Date(oldestEv.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    sinceText = `${absTime} (${timeAgo(oldestEv.timestamp)})`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Changes</h1>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Since {sinceText}</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            style={{
              fontSize: '12px',
              padding: '5px 12px',
              borderRadius: '8px',
              border: '0.5px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
            onClick={() => load()}
          >
            Refresh
          </button>
          <span style={{ width: '4px' }} />
          {/* Severity filters */}
          {[null, 'critical', 'warning', 'info'].map((s) => (
            <button
              key={s ?? 'all'}
              style={filterBtnStyle(severityFilter === s, s ? SEVERITY_COLORS[s] : '#3B82F6')}
              onClick={() => setSeverityFilter(s)}
            >
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
          <span style={{ width: '8px' }} />
          {/* Module filters */}
          {['aod', 'aam', 'dcl'].map((m) => (
            <button
              key={m}
              style={filterBtnStyle(moduleFilters.has(m), MODULE_COLORS[m])}
              onClick={() => toggleModule(m)}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        {[
          { label: 'Critical', value: summary?.critical ?? 0, color: (summary?.critical ?? 0) > 0 ? '#EF4444' : '#22C55E' },
          { label: 'Warning', value: summary?.warning ?? 0, color: (summary?.warning ?? 0) > 0 ? '#F59E0B' : '#22C55E' },
          { label: 'Info', value: summary?.info ?? 0, color: '#3B82F6' },
          { label: 'Last scan', value: summary?.last_scan ? timeAgo(summary.last_scan) : '—', color: summary?.last_scan && (Date.now() - new Date(summary.last_scan).getTime()) < 900_000 ? '#22C55E' : 'var(--text-muted)' },
        ].map((card) => (
          <div key={card.label} style={cardStyle}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{card.label}</div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Event feed */}
      <div style={cardStyle}>
        {grouped.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            No events found
          </div>
        )}
        {grouped.map((group) => (
          <div key={group.date}>
            <div style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              padding: '10px 0 6px',
              borderBottom: '0.5px solid var(--border)',
              marginBottom: '6px',
            }}>
              {group.date}
            </div>
            {group.items.map((ev) => (
              <div key={ev.id} style={{ opacity: ev.acknowledged ? 0.5 : 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 0 8px 10px',
                    borderLeft: `3px solid ${SEVERITY_COLORS[ev.severity] || '#555'}`,
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                >
                  {/* Module badge */}
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: MODULE_COLORS[ev.source_module] || '#555',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: '#fff',
                    }}
                  >
                    {ev.source_module.toUpperCase().slice(0, 1)}
                  </span>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{ev.summary}</div>
                    {ev.detail && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {ev.detail}
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {timeAgo(ev.timestamp)}
                  </span>

                  {/* Severity pill */}
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '8px',
                      background: SEVERITY_PILL_BG[ev.severity] || '#252525',
                      color: SEVERITY_PILL_FG[ev.severity] || '#888',
                      flexShrink: 0,
                    }}
                  >
                    {ev.severity}
                  </span>

                  {/* Ack button */}
                  {(ev.severity === 'critical' || ev.severity === 'warning') && (
                    ev.acknowledged ? (
                      <span style={{ fontSize: '13px', color: '#22C55E', flexShrink: 0 }}>&#10003;</span>
                    ) : (
                      <button
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '0.5px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAck(ev.id)
                        }}
                      >
                        Ack
                      </button>
                    )
                  )}
                </div>

                {/* Expanded payload */}
                {expandedId === ev.id && ev.payload && Object.keys(ev.payload).length > 0 && (
                  <div
                    style={{
                      marginLeft: '13px',
                      padding: '8px 12px',
                      background: 'var(--bg-hover)',
                      borderRadius: '6px',
                      marginBottom: '6px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                    }}
                  >
                    {Object.entries(ev.payload).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ color: 'var(--text-muted)' }}>{k}:</span>{' '}
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
