/**
 * TourRecap — close stage of the deployment tour. Renders the timeline
 * strip in expanded form plus a short recap statement about the
 * Crestline deployment sequence.
 */

import TimelineStrip from '../components/TimelineStrip'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'
import { COMPANY, STAGES } from '../demo/seed'

export default function TourRecap() {
  useSurfaceExtras('page:tour-recap', {
    visible_panels: ['Deployment tour recap', 'Timeline strip (expanded)'],
    extra: {
      page: 'tour-recap',
      stage_count: STAGES.length,
      company: COMPANY.name,
    },
  })

  return (
    <div style={{ padding: '16px 4px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>
          {COMPANY.name} — deployment recap
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          From discovery to queryable in 15 days. contextOS layered 15–30+. The strip below
          shows the full sequence.
        </div>
      </div>

      <TimelineStrip variant="expanded" />

      <div
        data-testid="recap-summary"
        style={{
          border: '0.5px solid var(--border)',
          borderRadius: '12px',
          padding: '14px',
          background: 'var(--bg-card)',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px',
        }}
      >
        <RecapStat label="Apps discovered" value={String(COMPANY.apps_total)} />
        <RecapStat label="Systems of record" value={String(COMPANY.sors_total)} />
        <RecapStat label="Fabric vendors" value={String(COMPANY.fabric_vendors)} />
        <RecapStat label="Time to first query" value="Day 15" />
      </div>
    </div>
  )
}

function RecapStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>{value}</div>
    </div>
  )
}
