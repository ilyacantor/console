import { useEntity } from '../context/EntityContext'
import { useEngagement } from '../context/EngagementContext'
import { useHealth } from '../context/HealthContext'
import { capitalize } from '../utils/format'

export default function TopBar() {
  const { entities, selected, setSelected } = useEntity()
  const { engagements, activeEngagement, setActiveEngagement, loading: engLoading } = useEngagement()
  const { health } = useHealth()

  const healthText = health
    ? `${health.up_count}/${health.total} healthy`
    : '...'

  const selectStyle: React.CSSProperties = {
    fontSize: '12px',
    padding: '4px 8px',
    border: '0.5px solid var(--border)',
    borderRadius: '6px',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
  }

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

      {/* Center: Deal selector + Entity switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <select
          value={activeEngagement?.engagement_id ?? ''}
          onChange={(e) => {
            const found = engagements.find((eng) => eng.engagement_id === e.target.value)
            if (found) setActiveEngagement(found)
          }}
          style={selectStyle}
        >
          {engLoading && engagements.length === 0 && (
            <option value="">...</option>
          )}
          {engagements.map((eng) => (
            <option key={eng.engagement_id} value={eng.engagement_id}>
              {capitalize(eng.acquirer_entity_id)} → {capitalize(eng.target_entity_id)}
            </option>
          ))}
        </select>

        <select
          value={selected ?? ''}
          onChange={(e) => setSelected(e.target.value || null)}
          style={selectStyle}
        >
          <option value="">All entities</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
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
