import { useMode, type Mode } from '../context/ModeContext'

const MODES: Mode[] = ['SE', 'MA', 'ME']

export default function ModeSwitcher() {
  const { mode, setMode, isDev } = useMode()
  const options = isDev ? [...MODES, 'ALL' as Mode] : MODES

  return (
    <div
      data-testid="mode-switcher"
      style={{
        display: 'flex',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '0.5px solid var(--border)',
      }}
    >
      {options.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: mode === m ? 600 : 400,
            background: mode === m ? '#2563EB' : 'var(--bg-card)',
            color: mode === m ? '#fff' : 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
