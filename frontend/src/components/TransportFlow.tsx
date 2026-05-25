/**
 * TransportFlow — left-panel companion to MappingsReview.
 *
 * Animates an illustrative byte-flow for the selected pipe's modality
 * (Kafka, SQL, REST, WebSocket, etc.). This is presentation only — the
 * pipe metadata is real (from the seed catalog) but the flow itself is
 * a visual cue, not a live byte counter.
 */

import { useEffect, useState } from 'react'
import { SEED_PIPES, type Modality, type SeedPipe } from '../demo/seed'

interface TransportFlowProps {
  selectedPipeId: string | null
  onSelectPipe: (pipeId: string) => void
}

export default function TransportFlow({ selectedPipeId, onSelectPipe }: TransportFlowProps) {
  const selected = SEED_PIPES.find((p) => p.pipe_id === selectedPipeId) ?? SEED_PIPES[0]
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const i = setInterval(() => setTick((t) => (t + 1) % 100), 250)
    return () => clearInterval(i)
  }, [])

  return (
    <div
      data-testid="transport-flow"
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>Transport</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        Bytes flowing from each pipe's source system through the fabric to AOS.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
        {SEED_PIPES.slice(0, 12).map((pipe) => (
          <button
            key={pipe.pipe_id}
            data-testid="transport-pipe-row"
            data-pipe-id={pipe.pipe_id}
            data-selected={pipe.pipe_id === selected.pipe_id ? 'true' : 'false'}
            onClick={() => onSelectPipe(pipe.pipe_id)}
            style={{
              padding: '6px 8px',
              border: pipe.pipe_id === selected.pipe_id ? '0.5px solid rgba(11,202,217,0.45)' : '0.5px solid var(--border)',
              background: pipe.pipe_id === selected.pipe_id ? 'rgba(11,202,217,0.12)' : 'transparent',
              borderRadius: 4,
              fontSize: 11,
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 8,
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pipe.display_name}
            </span>
            <ModalityChip modality={pipe.modality} />
          </button>
        ))}
      </div>

      <div
        data-testid="transport-flow-viz"
        style={{
          border: '0.5px solid var(--border)',
          borderRadius: 6,
          padding: 10,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          {selected.modality} · {selected.display_name}
        </div>
        <FlowVisual pipe={selected} tick={tick} />
      </div>
    </div>
  )
}

function ModalityChip({ modality }: { modality: Modality }) {
  const color: Record<Modality, string> = {
    REST: '#22D3EE',
    GraphQL: '#A78BFA',
    SOAP: '#9CA3AF',
    Kafka: '#F59E0B',
    SQL: '#86EFAC',
    WebSocket: '#0BCAD9',
    'File/SFTP': '#FCD34D',
  }
  return (
    <span
      data-testid="modality-chip"
      data-modality={modality}
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: color[modality],
        background: 'rgba(255,255,255,0.06)',
        padding: '1px 6px',
        borderRadius: 3,
      }}
    >
      {modality}
    </span>
  )
}

function FlowVisual({ pipe, tick }: { pipe: SeedPipe; tick: number }) {
  const dotCount = 6
  const dots = Array.from({ length: dotCount }, (_, i) => {
    const phase = (tick + i * 16) % 100
    return { id: i, x: phase }
  })
  return (
    <svg
      viewBox="0 0 200 32"
      style={{ width: '100%', height: 'auto', maxHeight: 40 }}
      aria-label={`${pipe.modality} flow from ${pipe.source_system}`}
    >
      <line x1="6" y1="16" x2="194" y2="16" stroke="var(--border)" strokeWidth="0.8" />
      <text x="6" y="9" fontSize="7" fill="var(--text-muted)">{pipe.source_system}</text>
      <text x="194" y="9" fontSize="7" fill="var(--text-muted)" textAnchor="end">AOS</text>
      {dots.map((d) => (
        <circle key={d.id} cx={6 + (d.x / 100) * 188} cy={16} r="2" fill="#0BCAD9" opacity={1 - d.x / 130} />
      ))}
    </svg>
  )
}
