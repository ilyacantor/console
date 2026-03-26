import { useMode } from '../context/ModeContext'

export default function Merge() {
  const { mode } = useMode()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        color: 'var(--text-muted)',
        fontSize: '13px',
      }}
    >
      Merge — {mode}
    </div>
  )
}
