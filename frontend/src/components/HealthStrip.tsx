import type { ServiceHealth } from '../api/client'

const STATUS_COLORS = {
  up: '#22C55E',
  degraded: '#F59E0B',
  down: '#EF4444',
}

interface Props {
  services: ServiceHealth[]
}

export default function HealthStrip({ services }: Props) {
  return (
    <div className="flex gap-3 flex-wrap">
      {services.map((svc) => (
        <div
          key={svc.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#fff',
            border: '0.5px solid #E0E0E0',
            borderRadius: '12px',
            padding: '6px 12px',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: STATUS_COLORS[svc.status] ?? STATUS_COLORS.down,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '11px', color: '#666' }}>{svc.name}</span>
          <span style={{ fontSize: '11px', color: '#999' }}>
            {svc.response_time_s != null ? `${svc.response_time_s}s` : '—'}
          </span>
          {svc.standalone_url && (
            <a
              href={svc.standalone_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '10px',
                color: '#3B82F6',
                textDecoration: 'none',
              }}
            >
              open
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
