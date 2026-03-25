import { useEffect, useState } from 'react'
import { useEntity } from '../context/EntityContext'
import { fetchHealth, type HealthResponse } from '../api/client'

export default function TopBar() {
  const { entities, selected, setSelected } = useEntity()
  const [health, setHealth] = useState<HealthResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await fetchHealth()
        if (!cancelled) setHealth(data)
      } catch {
        // Health fetch failed — don't crash the header
      }
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const healthText = health
    ? `${health.up_count}/${health.total} healthy`
    : '...'

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 bg-white"
      style={{
        height: '44px',
        padding: '0 14px',
        borderBottom: '0.5px solid #E0E0E0',
      }}
    >
      {/* Left: Logo */}
      <div style={{ fontWeight: 700, fontSize: '16px', color: '#1a1a1a' }}>
        AOS Console
      </div>

      {/* Center-left: Entity switcher */}
      <select
        value={selected ?? ''}
        onChange={(e) => setSelected(e.target.value || null)}
        style={{
          fontSize: '12px',
          padding: '4px 8px',
          border: '0.5px solid #E0E0E0',
          borderRadius: '6px',
          background: '#fff',
          color: '#333',
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
            : '#999',
        }}
      >
        {healthText}
      </div>
    </div>
  )
}
