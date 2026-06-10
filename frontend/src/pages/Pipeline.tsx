import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Play,
  RotateCcw,
  ChevronRight,
  SkipForward,
  Circle,
  AlertTriangle,
  Terminal,
} from 'lucide-react'
import HealthStrip from '../components/HealthStrip'
import {
  startPipeline,
  fetchPipelineStatus,
  advancePipeline,
  fetchRuns,
  type PipelineStepData,
  type PipelineJobData,
} from '../api/client'
import { useHealth } from '../context/HealthContext'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'

// ── Status helpers ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  success: '#4ADE80',
  running: '#FBBF24',
  failed: '#F87171',
  skipped: '#EAB308',
  pending: '#4B5563',
}

function statusBorderBg(status: string): { border: string; bg: string } {
  switch (status) {
    case 'success': return { border: 'rgba(74,222,128,0.4)', bg: 'rgba(74,222,128,0.05)' }
    case 'running': return { border: 'rgba(251,191,36,0.4)', bg: 'rgba(251,191,36,0.05)' }
    case 'failed': return { border: 'rgba(248,113,113,0.4)', bg: 'rgba(248,113,113,0.05)' }
    case 'skipped': return { border: 'rgba(234,179,8,0.3)', bg: 'rgba(234,179,8,0.05)' }
    default: return { border: 'var(--border)', bg: 'var(--bg-card)' }
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle size={16} color="#4ADE80" />
    case 'running':
      return <Loader2 size={16} color="#FBBF24" style={{ animation: 'spin 1s linear infinite' }} />
    case 'failed':
      return <XCircle size={16} color="#F87171" />
    case 'skipped':
      return <AlertTriangle size={16} color="#EAB308" />
    default:
      return <Circle size={16} color="#4B5563" />
  }
}

function formatDuration(ms: number | null): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function isTerminal(status: string): boolean {
  return ['completed', 'completed_with_errors'].includes(status)
}

// ── Step Card ───────────────────────────────────────────────────────

function StepCard({
  step,
  isNextStep,
  stepMode,
  onRunStep,
  advancing,
  onClick,
  selected,
}: {
  step: PipelineStepData
  isNextStep: boolean
  stepMode: boolean
  onRunStep: () => void
  advancing: boolean
  onClick: () => void
  selected: boolean
}) {
  const { border, bg } = statusBorderBg(step.status)
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: '8px',
        border: `1px solid ${border}`,
        background: bg,
        padding: '10px 12px',
        minWidth: '160px',
        maxWidth: '200px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        cursor: 'pointer',
        outline: selected ? '2px solid #3B82F6' : 'none',
        outlineOffset: '2px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <StatusIcon status={step.status} />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {step.display_name}
        </span>
      </div>

      {step.provenance_tag && (
        <div
          style={{
            fontSize: '10px',
            color: 'rgba(147,197,253,0.8)',
            background: 'rgba(59,130,246,0.1)',
            borderRadius: '4px',
            padding: '2px 6px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={step.provenance_tag}
        >
          {step.provenance_tag}
        </div>
      )}

      {step.duration_ms != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#9CA3AF' }}>
          <Clock size={12} />
          {formatDuration(step.duration_ms)}
        </div>
      )}

      {step.message && step.status !== 'pending' && (
        <p
          style={{
            fontSize: '11px',
            lineHeight: 1.4,
            color: STATUS_COLORS[step.status] ?? '#9CA3AF',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            margin: 0,
          }}
          title={step.message}
        >
          {step.message}
        </p>
      )}

      {stepMode && isNextStep && step.status === 'pending' && (
        <button
          onClick={(e) => { e.stopPropagation(); onRunStep() }}
          disabled={advancing}
          style={{
            marginTop: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            borderRadius: '6px',
            background: '#2563EB',
            color: '#fff',
            border: 'none',
            cursor: advancing ? 'not-allowed' : 'pointer',
            opacity: advancing ? 0.5 : 1,
          }}
        >
          {advancing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={12} />}
          Run
        </button>
      )}
    </div>
  )
}

// ── Step Arrow ──────────────────────────────────────────────────────

function StepArrow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: '#4B5563', alignSelf: 'center' }}>
      <ChevronRight size={16} />
    </div>
  )
}

// ── Parallel Group ──────────────────────────────────────────────────

function ParallelGroup({
  steps,
  nextStepName,
  stepMode,
  onRunStep,
  advancing,
  selectedStepName,
  onSelectStep,
}: {
  steps: PipelineStepData[]
  nextStepName: string | null
  stepMode: boolean
  onRunStep: () => void
  advancing: boolean
  selectedStepName: string | null
  onSelectStep: (name: string) => void
}) {
  const groupIsNext = steps.some((s) => s.name === nextStepName)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: '-16px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '10px',
          color: '#6B7280',
          background: 'var(--bg-card)',
          padding: '0 6px',
          borderRadius: '4px',
        }}
      >
        parallel
      </div>
      {steps.map((step) => (
        <StepCard
          key={step.name}
          step={step}
          isNextStep={groupIsNext}
          stepMode={stepMode}
          onRunStep={onRunStep}
          advancing={advancing}
          onClick={() => onSelectStep(step.name)}
          selected={step.name === selectedStepName}
        />
      ))}
    </div>
  )
}

// ── Pipeline Flow ───────────────────────────────────────────────────

function PipelineFlow({
  steps,
  nextStepName,
  stepMode,
  onAdvance,
  advancing,
  selectedStepName,
  onSelectStep,
}: {
  steps: PipelineStepData[]
  nextStepName: string | null
  stepMode: boolean
  onAdvance: () => void
  advancing: boolean
  selectedStepName: string | null
  onSelectStep: (name: string) => void
}) {
  const elements: JSX.Element[] = []
  const visited = new Set<number>()

  for (let i = 0; i < steps.length; i++) {
    if (visited.has(i)) continue
    const step = steps[i]!

    if (elements.length > 0) {
      elements.push(<StepArrow key={`arrow-${i}`} />)
    }

    if (step.parallel_group) {
      const groupSteps: PipelineStepData[] = []
      for (let j = i; j < steps.length; j++) {
        if (steps[j]!.parallel_group === step.parallel_group) {
          groupSteps.push(steps[j]!)
          visited.add(j)
        }
      }
      elements.push(
        <ParallelGroup
          key={`group-${step.parallel_group}`}
          steps={groupSteps}
          nextStepName={nextStepName}
          stepMode={stepMode}
          onRunStep={onAdvance}
          advancing={advancing}
          selectedStepName={selectedStepName}
          onSelectStep={onSelectStep}
        />,
      )
    } else {
      visited.add(i)
      elements.push(
        <StepCard
          key={step.name}
          step={step}
          isNextStep={step.name === nextStepName}
          stepMode={stepMode}
          onRunStep={onAdvance}
          advancing={advancing}
          onClick={() => onSelectStep(step.name)}
          selected={step.name === selectedStepName}
        />,
      )
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', overflowX: 'auto', paddingBottom: '8px', paddingTop: '20px' }}>
      {elements}
    </div>
  )
}

// ── AAM Transport Summary ───────────────────────────────────────────

function TransportSummary({ steps }: { steps: PipelineStepData[] }) {
  const transportStep = steps.find((s) => s.name === 'aam_transport')
  if (!transportStep || !transportStep.data) return null
  if (transportStep.status !== 'success' && transportStep.status !== 'failed') return null

  const data = transportStep.data as Record<string, any>
  const planes: Array<Record<string, any>> = Array.isArray(data.planes) ? data.planes : []
  const records = planes.reduce((acc, p) => acc + (Number(p.records) || 0), 0)
  const conceptNames = new Set<string>()
  for (const p of planes) {
    for (const name of Object.keys(p.concepts ?? {})) conceptNames.add(name)
  }
  const ingestId: string | null = planes[0]?.dcl_ingest_id ?? null

  return (
    <div
      data-testid="transport-summary"
      style={{
        marginTop: '10px',
        display: 'flex',
        gap: '24px',
        padding: '8px 14px',
        background: '#111318',
        border: '0.5px solid var(--border)',
        borderRadius: '8px',
        fontSize: '12px',
        fontFamily: 'monospace',
        color: '#9CA3AF',
      }}
    >
      <div data-testid="transport-records" data-value={records}>
        <span style={{ color: '#6B7280', marginRight: '6px' }}>Records</span>
        <span style={{ color: '#E5E7EB' }}>{records.toLocaleString()}</span>
      </div>
      <div data-testid="transport-planes">
        <span style={{ color: '#6B7280', marginRight: '6px' }}>Planes</span>
        <span style={{ color: '#E5E7EB' }}>{planes.length || '—'}</span>
        {planes.length > 0 && (
          <span> ({planes.map((p) => p.plane).join(', ')})</span>
        )}
      </div>
      <div data-testid="transport-concepts">
        <span style={{ color: '#6B7280', marginRight: '6px' }}>Concepts</span>
        <span style={{ color: '#E5E7EB' }}>{conceptNames.size}</span>
      </div>
      <div data-testid="transport-ingest">
        <span style={{ color: '#6B7280', marginRight: '6px' }}>DCL ingest</span>
        <span style={{ color: '#E5E7EB' }}>{ingestId ? String(ingestId).slice(0, 8) : '—'}</span>
      </div>
      <div>
        <span style={{ color: '#6B7280', marginRight: '6px' }}>Duration</span>
        <span style={{ color: '#E5E7EB' }}>
          {transportStep.duration_ms != null ? formatDuration(transportStep.duration_ms) : '—'}
        </span>
      </div>
    </div>
  )
}

// ── Step Detail Panel ───────────────────────────────────────────────

function StepDetail({ step }: { step: PipelineStepData }) {
  if (!step.data && step.status === 'pending') return null

  return (
    <div
      data-testid="step-detail"
      style={{
        marginTop: '14px',
        border: '0.5px solid var(--border)',
        borderRadius: '8px',
        padding: '14px',
        background: 'var(--bg-card)',
      }}
    >
      <h3 style={{ fontSize: '13px', fontWeight: 500, color: '#fff', marginBottom: '8px' }}>
        {step.display_name} — Details
      </h3>
      {step.message && (
        <p style={{ fontSize: '12px', marginBottom: '10px', color: STATUS_COLORS[step.status] ?? '#9CA3AF' }}>
          {step.message}
        </p>
      )}
      {step.data && (
        <pre
          data-testid="step-detail-json"
          style={{
            fontSize: '11px',
            color: '#9CA3AF',
            background: '#0A0A0A',
            borderRadius: '6px',
            padding: '10px',
            overflowX: 'auto',
            maxHeight: '200px',
            overflowY: 'auto',
            margin: 0,
          }}
        >
          {JSON.stringify(step.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────

export default function Pipeline() {
  const { health } = useHealth()
  const [executionMode, setExecutionMode] = useState<'batch' | 'step'>('batch')
  const [activePipelineRunId, setActivePipelineRunId] = useState<string | null>(null)
  const [jobData, setJobData] = useState<PipelineJobData | null>(null)
  const [runs, setRuns] = useState<PipelineJobData[]>([])
  const [starting, setStarting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStepName, setSelectedStepName] = useState<string | null>(null)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load run history
  const loadRuns = useCallback(async () => {
    try {
      const data = await fetchRuns(20)
      setRuns(data.runs)
    } catch (err) {
      console.warn('Failed to load runs:', err)
    }
  }, [])

  useEffect(() => { loadRuns() }, [loadRuns])

  // Poll pipeline status when active
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    if (!activePipelineRunId) return

    const poll = async () => {
      try {
        const data = await fetchPipelineStatus(activePipelineRunId)
        setJobData(data)
        if (isTerminal(data.status)) {
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
          loadRuns()
        }
      } catch (err) {
        console.warn('Poll failed:', err)
      }
    }

    poll()
    pollRef.current = setInterval(poll, 2000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [activePipelineRunId, loadRuns])

  // Auto-select interesting step
  useEffect(() => {
    if (!jobData) return
    const running = jobData.steps.find((s) => s.status === 'running')
    if (running) { setSelectedStepName(running.name); return }
    const failed = jobData.steps.find((s) => s.status === 'failed')
    if (failed) { setSelectedStepName(failed.name); return }
    for (let i = jobData.steps.length - 1; i >= 0; i--) {
      if (jobData.steps[i]!.status === 'success') {
        setSelectedStepName(jobData.steps[i]!.name)
        return
      }
    }
  }, [jobData])

  const hasActiveJob = !!activePipelineRunId
  const jobTerminal = jobData ? isTerminal(jobData.status) : false
  const isStepMode = executionMode === 'step'
  const isRunning = hasActiveJob && !jobTerminal && jobData?.steps?.some((s) => s.status === 'running')

  const nextStepName: string | null = (() => {
    if (!jobData || !isStepMode) return null
    for (const step of jobData.steps) {
      if (step.status === 'pending') return step.name
    }
    return null
  })()

  const handleStart = async () => {
    setActivePipelineRunId(null)
    setJobData(null)
    setError(null)
    setSelectedStepName(null)
    setStarting(true)
    try {
      const result = await startPipeline(executionMode, {})
      setActivePipelineRunId(result.pipeline_run_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const handleAdvance = async () => {
    if (!activePipelineRunId) return
    setError(null)
    setAdvancing(true)
    try {
      await advancePipeline(activePipelineRunId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdvancing(false)
    }
  }

  const handleReset = () => {
    setActivePipelineRunId(null)
    setJobData(null)
    setError(null)
    setSelectedStepName(null)
  }

  const canStart = !hasActiveJob || jobTerminal

  const selectedStep = jobData?.steps.find((s) => s.name === selectedStepName)

  useSurfaceExtras('page:pipeline', {
    visible_panels: [
      'pipeline steps',
      'run history',
    ],
    active_selection: selectedStepName ? { step_name: selectedStepName } : null,
    last_errors: error ? [error] : [],
    extra: {
      page: 'pipeline',
      execution_mode: executionMode,
      active_run_id: activePipelineRunId,
      active_run_status: jobData?.status ?? null,
      active_run_terminal: jobTerminal,
      active_run_name: jobData?.run_name ?? null,
      step_statuses: (jobData?.steps ?? []).map((s) => ({
        name: s.name,
        display_name: s.display_name,
        status: s.status,
        duration_ms: s.duration_ms ?? null,
        message: s.message,
      })),
      failed_steps: (jobData?.steps ?? [])
        .filter((s) => s.status === 'failed')
        .map((s) => ({
          name: s.name,
          display_name: s.display_name,
          message: s.message,
        })),
      recent_runs: runs.slice(0, 5).map((r) => ({
        run_name: r.run_name,
        status: r.status,
        started_at: r.started_at,
      })),
    },
  })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={18} color="#60A5FA" />
          <h1 style={{ fontSize: '16px', fontWeight: 600 }}>Pipeline</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Execution Mode */}
          <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '0.5px solid var(--border)' }}>
            {(['batch', 'step'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setExecutionMode(m)}
                disabled={!!isRunning}
                style={{
                  padding: '5px 10px',
                  fontSize: '11px',
                  background: executionMode === m ? '#374151' : 'var(--bg-card)',
                  color: executionMode === m ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  opacity: isRunning ? 0.5 : 1,
                }}
              >
                {m === 'step' ? 'Step-by-Step' : 'Batch'}
              </button>
            ))}
          </div>

          {/* Run */}
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '8px',
              background: '#2563EB',
              color: '#fff',
              border: 'none',
              cursor: !canStart || starting ? 'not-allowed' : 'pointer',
              opacity: !canStart || starting ? 0.5 : 1,
            }}
          >
            {starting
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <Play size={14} />}
            Run
          </button>

          {/* Next Step */}
          {isStepMode && hasActiveJob && !jobTerminal && nextStepName && (
            <button
              onClick={handleAdvance}
              disabled={advancing || !!jobData?.steps.some((s) => s.status === 'running')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '8px',
                background: '#374151',
                color: '#fff',
                border: 'none',
                cursor: advancing ? 'not-allowed' : 'pointer',
                opacity: advancing ? 0.5 : 1,
              }}
            >
              {advancing
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <SkipForward size={14} />}
              Next Step
            </button>
          )}

          {/* Reset */}
          {hasActiveJob && (
            <button
              onClick={handleReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                fontSize: '12px',
                color: '#EF4444',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '8px',
              }}
            >
              <RotateCcw size={14} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            background: '#2A1515',
            border: '0.5px solid #EF4444',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#FCA5A5',
            marginBottom: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Health */}
      {health && (
        <div style={{ marginBottom: '14px' }}>
          <HealthStrip services={health.services} />
        </div>
      )}

      {/* Pipeline Loading */}
      {hasActiveJob && !jobData && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px',
            background: 'var(--bg-card)',
            borderRadius: '12px',
            border: '0.5px solid var(--border)',
            marginBottom: '14px',
          }}
        >
          <Loader2 size={18} color="#FBBF24" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '13px', color: '#9CA3AF' }}>Starting pipeline...</span>
        </div>
      )}

      {/* Pipeline Flow */}
      {hasActiveJob && jobData && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '0.5px solid var(--border)',
            borderRadius: '12px',
            padding: '14px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', color: '#6B7280' }}>{jobData.message}</span>
          </div>

          <PipelineFlow
            steps={jobData.steps}
            nextStepName={nextStepName}
            stepMode={isStepMode}
            onAdvance={handleAdvance}
            advancing={advancing}
            selectedStepName={selectedStepName}
            onSelectStep={setSelectedStepName}
          />

          <TransportSummary steps={jobData.steps} />

          {selectedStep && <StepDetail step={selectedStep} />}

          {/* Footer */}
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#6B7280' }}>
            <span data-testid="run-name-label" style={{ color: '#93C5FD', fontWeight: 500 }}>{jobData.run_name}</span>
            {!!jobData.config?.entity_id && (
              <>
                <span>|</span>
                <span data-testid="entity-id-label">Entity: {String(jobData.config.entity_id)}</span>
              </>
            )}
            <span>|</span>
            <span>Started: {new Date(jobData.started_at).toLocaleTimeString()}</span>
            {jobData.completed_at && (
              <>
                <span>|</span>
                <span>Completed: {new Date(jobData.completed_at).toLocaleTimeString()}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!hasActiveJob && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 0',
            color: '#6B7280',
            background: 'var(--bg-card)',
            border: '0.5px solid var(--border)',
            borderRadius: '12px',
            marginBottom: '14px',
          }}
        >
          <Terminal size={40} color="#374151" style={{ marginBottom: '14px' }} />
          <p style={{ fontSize: '13px', margin: 0 }}>Click Run to start the pipeline.</p>
          <p style={{ fontSize: '11px', color: '#4B5563', marginTop: '4px' }}>
            Services must be healthy before running a pipeline.
          </p>
        </div>
      )}

      {/* Run History */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border)',
          borderRadius: '12px',
          padding: '14px',
        }}
      >
        <h2 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Run History</h2>
        {runs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No runs yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...thStyle, textAlign: 'left' }}>Run</th>
                <th style={thStyle}>Execution</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Steps</th>
                <th style={thStyle}>Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <RunRow
                  key={run.pipeline_run_id}
                  run={run}
                  expanded={expandedRun === run.pipeline_run_id}
                  onToggle={() => setExpandedRun(expandedRun === run.pipeline_run_id ? null : run.pipeline_run_id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Global keyframes for spin */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Run History Row ─────────────────────────────────────────────────

function RunRow({ run, expanded, onToggle }: { run: PipelineJobData; expanded: boolean; onToggle: () => void }) {
  const statusColor = run.status === 'completed' ? '#4ADE80'
    : run.status === 'completed_with_errors' ? '#F87171'
    : '#FBBF24'
  const statusBg = run.status === 'completed' ? '#14332A'
    : run.status === 'completed_with_errors' ? '#2A1515'
    : '#2A2510'

  const succeeded = run.steps?.filter((s) => s.status === 'success').length ?? 0
  const total = run.steps?.length ?? 0

  return (
    <>
      <tr onClick={onToggle} style={{ borderBottom: '1px solid #222', cursor: 'pointer' }}>
        <td style={{ ...tdStyle, textAlign: 'left', fontSize: '11px' }}>
          <span data-testid="history-run-name" style={{ color: '#93C5FD', fontWeight: 500 }}>{run.run_name}</span>
        </td>
        <td style={{ ...tdStyle, fontSize: '11px', color: '#9CA3AF' }}>
          {run.execution_mode}
        </td>
        <td style={tdStyle}>
          <span
            style={{
              display: 'inline-block',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
              background: statusBg,
              color: statusColor,
            }}
          >
            {run.status}
          </span>
        </td>
        <td style={{ ...tdStyle, fontSize: '11px', color: '#9CA3AF' }}>
          {succeeded}/{total}
        </td>
        <td style={{ ...tdStyle, fontSize: '11px', color: '#9CA3AF' }}>
          {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
        </td>
      </tr>
      {expanded && run.steps && (
        <tr>
          <td colSpan={5} style={{ padding: '8px 14px', background: 'var(--bg-hover)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                {run.steps.map((step) => (
                  <tr key={step.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px', width: '24px' }}>
                      <StatusIcon status={step.status} />
                    </td>
                    <td style={{ padding: '4px 8px' }}>{step.display_name}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'center', color: '#9CA3AF' }}>
                      {formatDuration(step.duration_ms)}
                    </td>
                    <td style={{ padding: '4px 8px', color: STATUS_COLORS[step.status] ?? '#9CA3AF', fontSize: '10px' }}>
                      {step.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textAlign: 'center',
  textTransform: 'uppercase',
}

const tdStyle: React.CSSProperties = {
  padding: '8px',
  textAlign: 'center',
}
