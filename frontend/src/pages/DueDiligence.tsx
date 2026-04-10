import { useState } from 'react'
import ModuleIframe from '../components/ModuleIframe'

const NLQ_BASE = import.meta.env.VITE_NLQ_URL
if (!NLQ_BASE) {
  throw new Error('VITE_NLQ_URL is required — set it at build time so DueDiligence can reach NLQ')
}

type Tab = 'qofe' | 'xsell' | 'upsell' | 'whatif'

const TABS: { key: Tab; label: string }[] = [
  { key: 'qofe', label: 'QofE' },
  { key: 'xsell', label: 'X-sell' },
  { key: 'upsell', label: 'Upsell' },
  { key: 'whatif', label: 'What-if' },
]

export default function DueDiligence() {
  const [tab, setTab] = useState<Tab>('qofe')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: tab === t.key ? 600 : 400,
              border: '0.5px solid var(--border)',
              borderRadius: '8px',
              cursor: 'pointer',
              background: tab === t.key ? 'var(--bg-hover)' : 'transparent',
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ModuleIframe
        key={tab}
        serviceName="NLQ"
        baseUrl={`${NLQ_BASE}?view=reports`}
        title={`Due Diligence — ${TABS.find((t) => t.key === tab)!.label}`}
      />
    </div>
  )
}
