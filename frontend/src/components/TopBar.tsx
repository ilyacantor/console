import { useHealth } from '../context/HealthContext'
import ModeSwitcher from './ModeSwitcher'
import EntitySwitcher from './EntitySwitcher'

export default function TopBar() {
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

      {/* Center: Mode switcher + Entity switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ModeSwitcher />
        <EntitySwitcher />
      </div>

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
