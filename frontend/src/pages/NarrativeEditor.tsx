import { useEffect, useState } from 'react'
import { fetchNarrative, updateNarrative, type NarrativeStep } from '../api/client'

function StepCard({
  step,
  index,
  total,
  expanded,
  onToggle,
  onChange,
  onMoveUp,
  onMoveDown,
}: {
  step: NarrativeStep
  index: number
  total: number
  expanded: boolean
  onToggle: () => void
  onChange: (updated: NarrativeStep) => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)', marginBottom: '8px' }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', cursor: 'pointer' }}
      >
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{index + 1}.</span>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{step.title}</span>
        <span style={{
          fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px',
          background: '#E0E7FF', color: '#3730A3',
        }}>
          {step.phase}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '0 12px 12px', borderTop: '0.5px solid var(--border)' }}>
          <div style={{ marginTop: '8px', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Title</label>
            <input
              value={step.title}
              onChange={(e) => onChange({ ...step, title: e.target.value })}
              style={{ display: 'block', width: '100%', padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Description</label>
            <input
              value={step.description}
              onChange={(e) => onChange({ ...step, description: e.target.value })}
              style={{ display: 'block', width: '100%', padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Messages</div>
          {step.messages.map((msg, mi) => (
            <div key={mi} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <textarea
                value={msg.text}
                onChange={(e) => {
                  const msgs = [...step.messages]
                  msgs[mi] = { ...msgs[mi]!, text: e.target.value }
                  onChange({ ...step, messages: msgs })
                }}
                rows={2}
                style={{ flex: 1, padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', resize: 'vertical' }}
              />
              <input
                type="number"
                value={msg.delay_ms}
                onChange={(e) => {
                  const msgs = [...step.messages]
                  msgs[mi] = { ...msgs[mi]!, delay_ms: Number(e.target.value) }
                  onChange({ ...step, messages: msgs })
                }}
                style={{ width: '70px', padding: '4px 6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', alignSelf: 'center' }}>ms</span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <button
              disabled={index === 0}
              onClick={onMoveUp}
              style={{ padding: '2px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: index === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: index === 0 ? 'default' : 'pointer' }}
            >
              Move up
            </button>
            <button
              disabled={index === total - 1}
              onClick={onMoveDown}
              style={{ padding: '2px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: index === total - 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: index === total - 1 ? 'default' : 'pointer' }}
            >
              Move down
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NarrativeEditor() {
  const [steps, setSteps] = useState<NarrativeStep[]>([])
  const [defaults, setDefaults] = useState<NarrativeStep[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    fetchNarrative()
      .then(({ narrative }) => {
        setSteps(narrative.steps || [])
        setDefaults(narrative.steps || [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load narrative'))
  }, [])

  const totalMessages = steps.reduce((sum, s) => sum + s.messages.length, 0)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateNarrative({ steps })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save narrative')
    }
    setSaving(false)
  }

  const handleSaveToYaml = () => {
    const yamlLines: string[] = ['steps:']
    for (const step of steps) {
      yamlLines.push(`  - id: "${step.id}"`)
      yamlLines.push(`    title: "${step.title}"`)
      yamlLines.push(`    phase: "${step.phase}"`)
      yamlLines.push(`    description: "${step.description}"`)
      yamlLines.push('    messages:')
      for (const msg of step.messages) {
        yamlLines.push(`      - text: "${msg.text.replace(/"/g, '\\"')}"`)
        yamlLines.push(`        delay_ms: ${msg.delay_ms}`)
      }
    }
    const blob = new Blob([yamlLines.join('\n')], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'narrative.yaml'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveAndPreview = async () => {
    await handleSave()
    setPreview(true)
  }

  const handleReset = () => {
    setSteps(defaults.map((s) => ({ ...s, messages: s.messages.map((m) => ({ ...m })) })))
  }

  const moveStep = (from: number, to: number) => {
    const next = [...steps]
    const [removed] = next.splice(from, 1)
    next.splice(to, 0, removed!)
    setSteps(next)
    setExpanded(to)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '720px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Narrative Editor</h1>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        {steps.length} steps, {totalMessages} messages
      </div>
      {error && (
        <div style={{ padding: '8px 12px', marginBottom: '16px', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {steps.map((step, i) => (
        <StepCard
          key={step.id}
          step={step}
          index={i}
          total={steps.length}
          expanded={expanded === i}
          onToggle={() => setExpanded(expanded === i ? null : i)}
          onChange={(updated) => { const next = [...steps]; next[i] = updated; setSteps(next) }}
          onMoveUp={() => moveStep(i, i - 1)}
          onMoveDown={() => moveStep(i, i + 1)}
        />
      ))}

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button
          onClick={handleReset}
          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          Reset Defaults
        </button>
        <button
          onClick={handleSaveToYaml}
          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          Save to YAML
        </button>
        <button
          onClick={handleSaveAndPreview}
          disabled={saving}
          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text-primary)', cursor: saving ? 'default' : 'pointer' }}
        >
          Save & Preview
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 500, border: 'none', borderRadius: '6px', background: '#3B82F6', color: '#fff', cursor: saving ? 'default' : 'pointer' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {preview && (
        <div style={{ marginTop: '20px', padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Preview</span>
            <button
              onClick={() => setPreview(false)}
              style={{ fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 8px', background: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
          {steps.map((step, i) => (
            <div key={step.id} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: i < steps.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{i + 1}.</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{step.title}</span>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px', background: '#E0E7FF', color: '#3730A3' }}>{step.phase}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{step.description}</div>
              {step.messages.map((msg, mi) => (
                <div key={mi} style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '2px 0 2px 16px' }}>
                  &ldquo;{msg.text}&rdquo; <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({msg.delay_ms}ms)</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
