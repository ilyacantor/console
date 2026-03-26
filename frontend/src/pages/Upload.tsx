import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadFile, proceedUpload, fetchEngagements, type UploadResult, type Engagement } from '../api/client'

interface PanelFile {
  upload: UploadResult | null
  uploading: boolean
  error: string | null
}

const INTAKE_STEPS = [
  'Parse GL (acquirer)',
  'Parse GL (target)',
  'Validate both GLs',
  'Convert to triples',
  'Push to PG',
  'Trigger COFA chain',
]

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    parsed: { bg: '#DCFCE7', text: '#166534' },
    parsed_with_warnings: { bg: '#FEF9C3', text: '#854D0E' },
    parsing: { bg: '#DBEAFE', text: '#1E40AF' },
    error: { bg: '#FEE2E2', text: '#991B1B' },
    pending: { bg: '#F3F4F6', text: '#6B7280' },
    converted: { bg: '#DCFCE7', text: '#166534' },
    stubbed: { bg: '#FEF3C7', text: '#92400E' },
  }
  const c = colors[status] || colors.pending
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, background: c.bg, color: c.text, borderRadius: '4px', padding: '2px 8px' }}>
      {status}
    </span>
  )
}

function ValidationList({ validations }: { validations: { check: string; pass: boolean; detail: string }[] }) {
  return (
    <div style={{ marginTop: '8px' }}>
      {validations.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: '6px', fontSize: '12px', padding: '2px 0', color: 'var(--text-secondary)' }}>
          <span style={{ color: v.pass ? '#22C55E' : '#EF4444', flexShrink: 0 }}>{v.pass ? '\u2713' : '\u2717'}</span>
          <span>{v.check}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{v.detail}</span>
        </div>
      ))}
    </div>
  )
}

function DropPanel({
  label,
  color,
  entityId,
  engagementId,
  panelFile,
  onUploaded,
}: {
  label: string
  color: string
  entityId: string
  engagementId?: string
  panelFile: PanelFile
  onUploaded: (result: UploadResult) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = useCallback(
    async (files: FileList) => {
      const file = files[0]
      if (!file) return
      try {
        const result = await uploadFile(file, entityId, engagementId)
        onUploaded(result)
      } catch (err: unknown) {
        onUploaded({
          upload_id: '',
          engagement_id: null,
          entity_id: entityId,
          file_name: file.name,
          file_type: 'gl',
          file_size: file.size,
          parse_result: { error: err instanceof Error ? err.message : 'Upload failed' },
          status: 'error',
          created_at: null,
        })
      }
    },
    [entityId, engagementId, onUploaded],
  )

  const upload = panelFile.upload

  return (
    <div style={{ flex: 1 }}>
      <span
        style={{
          display: 'inline-block',
          fontSize: '11px',
          fontWeight: 600,
          background: color,
          color: '#fff',
          borderRadius: '4px',
          padding: '2px 10px',
          marginBottom: '8px',
        }}
      >
        {label}
      </span>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? color : 'var(--border)'}`,
          borderRadius: '8px',
          padding: '24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'var(--bg-hover)' : 'transparent',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Drop GL and CoA files here
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>CSV or Excel</div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {upload && (
        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: '6px', border: '0.5px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{upload.file_name}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{upload.file_size ? `${(upload.file_size / 1024).toFixed(1)} KB` : ''}</span>
            {upload.parse_result?.rows != null && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{upload.parse_result.rows} rows</span>
            )}
            <StatusPill status={upload.status} />
          </div>
          {upload.parse_result?.validations && (
            <ValidationList validations={upload.parse_result.validations} />
          )}
          {upload.parse_result?.error && (
            <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>{upload.parse_result.error}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Upload() {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [activeEngagement, setActiveEngagement] = useState<Engagement | null>(null)
  const [acquirerFile, setAcquirerFile] = useState<PanelFile>({ upload: null, uploading: false, error: null })
  const [targetFile, setTargetFile] = useState<PanelFile>({ upload: null, uploading: false, error: null })
  const [intakeStep, setIntakeStep] = useState(-1)
  const [intakeStatuses, setIntakeStatuses] = useState<string[]>(INTAKE_STEPS.map(() => 'pending'))
  const [intakeDurations, setIntakeDurations] = useState<(number | null)[]>(INTAKE_STEPS.map(() => null))
  const [proceeding, setProceeding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchEngagements()
      .then(({ engagements: e }) => {
        setEngagements(e)
        if (e.length > 0) setActiveEngagement(e[0])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load engagements'))
  }, [])

  const acquirerEntityId = activeEngagement?.acquirer_entity_id || ''
  const targetEntityId = activeEngagement?.target_entity_id || ''

  const bothParsed =
    acquirerFile.upload?.status?.startsWith('parsed') &&
    targetFile.upload?.status?.startsWith('parsed')

  const handleProceed = async () => {
    if (!acquirerFile.upload || !targetFile.upload) return
    setProceeding(true)
    setError(null)
    const statuses = INTAKE_STEPS.map(() => 'pending')
    const durations: (number | null)[] = INTAKE_STEPS.map(() => null)

    const markStep = (i: number, status: string, dur: number | null = null) => {
      statuses[i] = status
      durations[i] = dur
      setIntakeStatuses([...statuses])
      setIntakeDurations([...durations])
    }

    try {
      // Steps 0-1: Parse GL — already completed during file upload
      for (const i of [0, 1]) {
        setIntakeStep(i)
        markStep(i, 'running')
        markStep(i, 'success', 0)
      }

      // Step 2: Validate both GLs — check parse results
      setIntakeStep(2)
      markStep(2, 'running')
      const t2 = Date.now()
      const acqValidations = acquirerFile.upload.parse_result?.validations || []
      const tgtValidations = targetFile.upload.parse_result?.validations || []
      const acqAllPass = acqValidations.every((v) => v.pass)
      const tgtAllPass = tgtValidations.every((v) => v.pass)
      if (!acqAllPass || !tgtAllPass) {
        markStep(2, 'error', (Date.now() - t2) / 1000)
        setError('Validation failed — resolve warnings before proceeding')
        setProceeding(false)
        return
      }
      markStep(2, 'success', (Date.now() - t2) / 1000)

      // Step 3: Convert to triples — call proceed for both entities
      setIntakeStep(3)
      markStep(3, 'running')
      const t3 = Date.now()
      const acqResult = await proceedUpload(acquirerFile.upload.upload_id)
      const tgtResult = await proceedUpload(targetFile.upload.upload_id)
      const isStubbed = acqResult.conversion?.note?.includes('Stub') || tgtResult.conversion?.note?.includes('Stub')
      markStep(3, isStubbed ? 'stubbed' : 'success', (Date.now() - t3) / 1000)

      // Steps 4-5: Push to PG + Trigger COFA chain — not yet implemented
      for (const i of [4, 5]) {
        setIntakeStep(i)
        markStep(i, 'running')
        markStep(i, 'stubbed', 0)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pipeline step failed'
      setError(msg)
      // Mark current running step as error
      const runningIdx = statuses.indexOf('running')
      if (runningIdx >= 0) markStep(runningIdx, 'error', null)
    }
    setProceeding(false)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Upload</h1>

      {engagements.length > 1 && (
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Engagement:</span>
          <select
            value={activeEngagement?.engagement_id || ''}
            onChange={(e) => setActiveEngagement(engagements.find((eng) => eng.engagement_id === e.target.value) || null)}
            style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text-primary)' }}
          >
            {engagements.map((eng) => (
              <option key={eng.engagement_id} value={eng.engagement_id}>
                {eng.acquirer_entity_id} + {eng.target_entity_id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
        <DropPanel
          label="Acquirer"
          color="#3B82F6"
          entityId={acquirerEntityId}
          engagementId={activeEngagement?.engagement_id}
          panelFile={acquirerFile}
          onUploaded={(r) => setAcquirerFile({ upload: r, uploading: false, error: null })}
        />
        <DropPanel
          label="Target"
          color="#F59E0B"
          entityId={targetEntityId}
          engagementId={activeEngagement?.engagement_id}
          panelFile={targetFile}
          onUploaded={(r) => setTargetFile({ upload: r, uploading: false, error: null })}
        />
      </div>

      <div style={{ marginBottom: '24px', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>Optional enrichment</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>Unlocks deliverables 8-10</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {[
            { label: 'Customer data', desc: 'Customer list with revenue', unlocks: 'Overlap & concentration' },
            { label: 'Vendor data', desc: 'Vendor list with spend', unlocks: 'Vendor analysis' },
            { label: 'Headcount data', desc: 'Employee roster', unlocks: 'Headcount bridge' },
          ].map((slot) => (
            <div key={slot.label} style={{ flex: 1, border: '1.5px dashed var(--border)', borderRadius: '6px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{slot.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{slot.desc}</div>
              <div style={{ fontSize: '11px', color: '#3B82F6', marginTop: '4px' }}>Unlocks: {slot.unlocks}</div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', marginBottom: '16px', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '12px' }}>
          {error}
        </div>
      )}

      <div style={{ padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '0.5px solid var(--border)', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Intake pipeline</div>
        {INTAKE_STEPS.map((step, i) => {
          const s = intakeStatuses[i]
          const icon = s === 'success' ? '\u2713' : s === 'stubbed' ? '\u25CB' : s === 'error' ? '\u2717' : s === 'running' ? '\u25CB' : '\u00B7'
          const color = s === 'success' ? '#22C55E' : s === 'stubbed' ? '#D97706' : s === 'error' ? '#EF4444' : s === 'running' ? '#3B82F6' : 'var(--text-muted)'
          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px' }}>
              <span style={{ width: '16px', textAlign: 'center', flexShrink: 0, color }}>{icon}</span>
              <span style={{ color, flex: 1 }}>{step}</span>
              {intakeDurations[i] != null && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{intakeDurations[i]!.toFixed(1)}s</span>
              )}
              {s === 'stubbed' && (
                <span style={{ fontSize: '10px', fontWeight: 600, background: '#FEF3C7', color: '#92400E', borderRadius: '3px', padding: '1px 5px' }}>stub</span>
              )}
            </div>
          )
        })}
      </div>

      <button
        disabled={!bothParsed || proceeding}
        onClick={handleProceed}
        style={{
          padding: '8px 20px',
          fontSize: '13px',
          fontWeight: 600,
          borderRadius: '6px',
          border: 'none',
          background: bothParsed && !proceeding ? '#3B82F6' : '#E5E7EB',
          color: bothParsed && !proceeding ? '#fff' : '#9CA3AF',
          cursor: bothParsed && !proceeding ? 'pointer' : 'not-allowed',
        }}
      >
        {proceeding ? 'Processing...' : 'Proceed to mapping'}
      </button>
    </div>
  )
}
