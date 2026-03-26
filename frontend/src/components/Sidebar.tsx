import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { fetchChangeSummary } from '../api/client'

interface NavItem {
  label: string
  path: string
  color: string
  indent?: boolean
  external?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    title: 'CONSUME',
    items: [
      { label: 'Dashboards', path: '/dashboards', color: '#3B82F6' },
      { label: 'Reports', path: '/reports', color: '#3B82F6' },
      { label: 'Inspect', path: '/inspect', color: '#3B82F6' },
    ],
  },
  {
    title: 'M&A',
    items: [
      { label: 'Deal', path: '/deal', color: '#F97066' },
      { label: 'Upload', path: '/upload', color: '#F97066' },
      { label: 'Due Diligence', path: '/due-diligence', color: '#F97066' },
      { label: 'Integration', path: '/integration', color: '#F97066' },
    ],
  },
  {
    title: 'MONITOR',
    items: [
      { label: 'Changes', path: '/changes', color: '#F59E0B' },
      { label: 'Pipeline', path: '/pipeline', color: '#22C55E' },
    ],
  },
  {
    title: 'MAESTRA',
    items: [
      { label: 'Tasks', path: '/tasks', color: '#7C3AED' },
      { label: 'Engagements', path: '/engagements', color: '#7C3AED' },
      { label: 'Constitution', path: '/constitution', color: '#7C3AED' },
      { label: 'Instrumentation', path: '/instrumentation', color: '#7C3AED', indent: true },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { label: 'Config', path: '/config', color: '#9CA3AF' },
      { label: 'Narrative', path: '/narrative-editor', color: '#9CA3AF' },
      { label: 'Policy', path: '', color: '#9CA3AF', external: 'https://aodv3-1.onrender.com' },
    ],
  },
]

export default function Sidebar() {
  const [badgeCount, setBadgeCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const s = await fetchChangeSummary()
        if (!cancelled) setBadgeCount(s.critical + s.warning)
      } catch {
        // non-critical
      }
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <nav
      className="flex-shrink-0 overflow-y-auto"
      style={{
        width: '180px',
        background: 'var(--bg-surface)',
        borderRight: '0.5px solid var(--border)',
        padding: '12px 0',
      }}
    >
      {NAV.map((section) => (
        <div key={section.title} style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              padding: '0 14px',
              marginBottom: '4px',
            }}
          >
            {section.title}
          </div>
          {section.items.map((item) =>
            item.external ? (
              <a
                key={item.label}
                href={item.external}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 no-underline"
                style={{
                  padding: '4px 14px',
                  paddingLeft: item.indent ? '28px' : '14px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  textDecoration: 'none',
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: item.color,
                    flexShrink: 0,
                  }}
                />
                {item.label}
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ marginLeft: '2px', opacity: 0.5 }}>
                  <path d="M3.5 1.5h7v7M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                className="flex items-center gap-2 no-underline"
                style={({ isActive }) => ({
                  padding: '4px 14px',
                  paddingLeft: item.indent ? '28px' : '14px',
                  fontSize: '13px',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                })}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: item.color,
                    flexShrink: 0,
                  }}
                />
                {item.label}
                {item.label === 'Changes' && badgeCount > 0 && (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      background: '#EF4444',
                      color: '#fff',
                      borderRadius: '8px',
                      padding: '1px 5px',
                      marginLeft: '4px',
                    }}
                  >
                    {badgeCount}
                  </span>
                )}
              </NavLink>
            ),
          )}
        </div>
      ))}
    </nav>
  )
}
