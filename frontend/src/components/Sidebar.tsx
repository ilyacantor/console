import { NavLink } from 'react-router-dom'

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
      { label: 'Policy', path: '', color: '#9CA3AF', external: 'https://aodv3-1.onrender.com' },
    ],
  },
]

export default function Sidebar() {
  return (
    <nav
      className="flex-shrink-0 overflow-y-auto bg-white"
      style={{
        width: '180px',
        borderRight: '0.5px solid #E0E0E0',
        padding: '12px 0',
      }}
    >
      {NAV.map((section) => (
        <div key={section.title} style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#999',
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
                  color: '#666',
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
                  color: isActive ? '#1a1a1a' : '#666',
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? '#F0F0F0' : 'transparent',
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
              </NavLink>
            ),
          )}
        </div>
      ))}
    </nav>
  )
}
