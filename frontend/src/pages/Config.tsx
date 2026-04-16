import { useEffect, useMemo, useState } from 'react'
import { fetchConfig, updateConfig, fetchEngagements, fetchCronLastRuns } from '../api/client'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'

interface CronSchedule {
  interval_minutes: number
  enabled: boolean
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Config() {
  const [cron, setCron] = useState<Record<string, CronSchedule>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [thresholds, setThresholds] = useState<Record<string, number>>({})
  const [entityConfig, setEntityConfig] = useState<Record<string, string>>({
    default_entity_view: 'All',
    engagement_mode: 'MA',
  })
  const [saving, setSaving] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [entityNames, setEntityNames] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastRuns, setLastRuns] = useState<Record<string, string | null>>({})

  useEffect(() => {
    fetchConfig()
      .then(({ config }) => {
        if (config.cron_schedules) setCron(config.cron_schedules as Record<string, CronSchedule>)
        if (config.module_urls) setUrls(config.module_urls as Record<string, string>)
        if (config.detection_thresholds) setThresholds(config.detection_thresholds as Record<string, number>)
        if (config.entity_config) setEntityConfig(config.entity_config as Record<string, string>)
        setLoaded(true)
      })
      .catch((err) => { setLoaded(true); setError(err instanceof Error ? err.message : 'Failed to load config') })
    fetchEngagements()
      .then(({ engagements }) => {
        const names = new Set<string>()
        for (const e of engagements) {
          names.add(e.acquirer_entity_id)
          names.add(e.target_entity_id)
        }
        setEntityNames([...names])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load engagements'))
    fetchCronLastRuns()
      .then(({ last_runs }) => setLastRuns(last_runs))
      .catch(() => {}) // non-critical — cron may not have run yet
  }, [])

  const save = async (section: string, data: Record<string, unknown>) => {
    setSaving(section)
    setError(null)
    try {
      await updateConfig(data)
    } catch (err) {
      setError(`Failed to save ${section}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    setSaving(null)
  }

  const surfaceExtras = useMemo(() => ({
    visible_panels: [
      'Cron schedules', 'Module URLs', 'Detection thresholds', 'Entity configuration',
    ],
    extra: {
      page: 'config',
      cron_schedules: cron,
      module_urls: urls,
      detection_thresholds: thresholds,
      entity_config: entityConfig,
      cron_last_runs: lastRuns,
      active_entities: entityNames,
      load_error: error,
    },
  }), [cron, urls, thresholds, entityConfig, lastRuns, entityNames, error])
  useSurfaceExtras('config', loaded ? surfaceExtras : null)

  if (!loaded) return <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>

  const cronModules = [
    { key: 'aod_discovery', label: 'AOD discovery' },
    { key: 'aam_drift', label: 'AAM drift' },
    { key: 'dcl_coverage', label: 'DCL coverage' },
    { key: 'health_check', label: 'Health check' },
  ]

  const urlModules = ['aod', 'aam', 'dcl', 'nlq', 'farm']

  const thresholdFields = [
    { key: 'coverage_drop_warning', label: 'Coverage drop alert (%)', default: 5 },
    { key: 'confidence_shift_warning', label: 'Confidence drop alert', default: 0.1 },
    { key: 'source_stale_hours', label: 'Freshness stale-after (hours)', default: 48 },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Config</h1>
      {error && (
        <div style={{ padding: '8px 12px', marginBottom: '16px', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '12px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* Cron schedules */}
        <div style={{ padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Cron schedules</div>
          {cronModules.map(({ key, label }) => {
            const entry = cron[key] || { interval_minutes: 15, enabled: true }
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
                <input
                  type="number"
                  value={entry.interval_minutes}
                  onChange={(e) => setCron({ ...cron, [key]: { ...entry, interval_minutes: Number(e.target.value) } })}
                  style={{ width: '60px', padding: '2px 6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)' }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>min</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '50px', textAlign: 'right' }}>{timeAgo(lastRuns[key])}</span>
                <button
                  onClick={() => setCron({ ...cron, [key]: { ...entry, enabled: !entry.enabled } })}
                  style={{
                    width: '32px', height: '18px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                    background: entry.enabled ? '#22C55E' : '#D1D5DB',
                    position: 'relative',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
                    left: entry.enabled ? '16px' : '2px', transition: 'left 0.15s',
                  }} />
                </button>
              </div>
            )
          })}
          <button
            onClick={() => save('cron', { cron_schedules: cron })}
            disabled={saving === 'cron'}
            style={{ marginTop: '8px', padding: '4px 12px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {saving === 'cron' ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Module URLs */}
        <div style={{ padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Module URLs</div>
          {urlModules.map((mod) => (
            <div key={mod} style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{mod}</label>
              <input
                value={urls[mod] || ''}
                onChange={(e) => setUrls({ ...urls, [mod]: e.target.value })}
                style={{ width: '100%', padding: '4px 8px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
              />
            </div>
          ))}
          <button
            onClick={() => save('urls', { module_urls: urls })}
            disabled={saving === 'urls'}
            style={{ marginTop: '4px', padding: '4px 12px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {saving === 'urls' ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Detection thresholds */}
        <div style={{ padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Detection thresholds</div>
          {thresholdFields.map(({ key, label, default: def }) => (
            <div key={key} style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</label>
              <input
                type="number"
                step={key === 'confidence_shift_warning' ? '0.01' : '1'}
                value={thresholds[key] ?? def}
                onChange={(e) => setThresholds({ ...thresholds, [key]: Number(e.target.value) })}
                style={{ display: 'block', width: '120px', padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)' }}
              />
            </div>
          ))}
          <button
            onClick={() => save('thresholds', { detection_thresholds: thresholds })}
            disabled={saving === 'thresholds'}
            style={{ marginTop: '8px', padding: '4px 12px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {saving === 'thresholds' ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Entity configuration */}
        <div style={{ padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Entity configuration</div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Active entities</label>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', padding: '4px 0' }}>{entityNames.length > 0 ? entityNames.join(', ') : 'None'}</div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Default entity view</label>
            <select
              value={entityConfig.default_entity_view || 'All'}
              onChange={(e) => setEntityConfig({ ...entityConfig, default_entity_view: e.target.value })}
              style={{ display: 'block', padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)' }}
            >
              <option>All</option>
              {entityNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Engagement mode</label>
            <select
              value={entityConfig.engagement_mode || 'MA'}
              onChange={(e) => setEntityConfig({ ...entityConfig, engagement_mode: e.target.value })}
              style={{ display: 'block', padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)' }}
            >
              <option value="SE">SE</option>
              <option value="ME">ME</option>
              <option value="MA">M&A</option>
            </select>
          </div>
          <button
            onClick={() => save('entity', { entity_config: entityConfig })}
            disabled={saving === 'entity'}
            style={{ marginTop: '8px', padding: '4px 12px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {saving === 'entity' ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
