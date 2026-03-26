import { useEntity } from '../context/EntityContext'

export default function EntitySwitcher() {
  const { options, selected, setSelected } = useEntity()

  return (
    <select
      data-testid="entity-switcher"
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
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
