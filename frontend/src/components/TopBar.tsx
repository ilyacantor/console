import { useEntity } from '../context/EntityContext'
import { useHealth } from '../context/HealthContext'

export default function TopBar() {
  const { entities, selected, setSelected } = useEntity()
  const { health } = useHealth()

  const healthText = health
    ? `${health.up_count}/${health.total} healthy`
    : '...'

  return (
    <div
      className="flex items-center justify-between flex-shrink-0"
      style={{
        height: '44px',
        padding: '0 14px',
        background: 'var(--bg-surface)',
        borderBottom: '0.5px solid var(--border)',
      }}
    >
      {/* Left: Logo */}
      <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>
        AOS Console
      </div>

      {/* Center-left: Entity switcher */}
      <select
        value={selected ?? ''}
        onChange={(e) => setSelected(e.target.value || null)}
        style={{
          fontSize: '12px',
          padding: '4px 8px',
          border: '0.5px solid var(--border)',
          borderRadius: '6px',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="">All entities</option>
        {entities.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </select>

      {/* Right: Health summary */}
      <div
        style={{
          fontSize: '12px',
          color: health?.overall === 'healthy' ? '#22C55E'
            : health?.overall === 'degraded' ? '#F59E0B'
            : 'var(--text-muted)',
        }}
      >
        {healthText}
      </div>
    </div>
  )
}
