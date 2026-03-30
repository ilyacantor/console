async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`
    try {
      const body = await resp.json()
      if (body.detail) detail = body.detail
    } catch {
      // ignore parse errors
    }
    throw new Error(detail)
  }
  return resp.json()
}

// Health
export interface ServiceHealth {
  name: string
  url: string
  status: 'up' | 'degraded' | 'down'
  response_time_s: number | null
  detail: string | null
  standalone_url: string | null
}

export interface HealthResponse {
  services: ServiceHealth[]
  overall: 'healthy' | 'degraded' | 'unhealthy'
  up_count: number
  total: number
}

export function fetchHealth(): Promise<HealthResponse> {
  return fetchJSON('/api/health')
}

// Pipeline — new orchestrator types (matching Platform's operator models)
export interface PipelineStepData {
  name: string
  display_name: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  message: string | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  data: Record<string, unknown> | null
  parallel_group: string | null
  provenance_tag: string | null
}

export interface PipelineJobData {
  pipeline_run_id: string
  run_name: string
  pipeline_mode: 'se' | 'me'
  execution_mode: 'batch' | 'step'
  status: string
  started_at: string
  completed_at: string | null
  steps: PipelineStepData[]
  current_step: number
  total_steps: number
  message: string
  config: Record<string, unknown>
  created_at?: string
}

interface StartPipelineResponse {
  pipeline_run_id: string
  run_name: string
  status: string
  message: string
}

export function startPipeline(
  mode: 'se' | 'me',
  execution: 'batch' | 'step',
  config?: Record<string, unknown>,
): Promise<StartPipelineResponse> {
  return fetchJSON('/api/pipeline/start', {
    method: 'POST',
    body: JSON.stringify({ mode, execution, config }),
  })
}

export function fetchPipelineStatus(pipelineRunId: string): Promise<PipelineJobData> {
  return fetchJSON(`/api/pipeline/status?pipeline_run_id=${encodeURIComponent(pipelineRunId)}`)
}

export function advancePipeline(pipelineRunId: string): Promise<PipelineJobData> {
  return fetchJSON(`/api/pipeline/advance?pipeline_run_id=${encodeURIComponent(pipelineRunId)}`, {
    method: 'POST',
  })
}

export function resetPipeline(): Promise<{ status: string }> {
  return fetchJSON('/api/pipeline/reset', { method: 'POST' })
}

export function fetchRuns(limit = 20): Promise<{ runs: PipelineJobData[] }> {
  return fetchJSON(`/api/pipeline/runs?limit=${limit}`)
}

export function fetchRun(pipelineRunId: string): Promise<PipelineJobData> {
  return fetchJSON(`/api/pipeline/runs/${pipelineRunId}`)
}

// DCL Recon
export interface ReconCheck {
  check: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  expected?: number | string[] | string
  actual?: number | string[] | string
  detail?: string | null
  entities?: string[]
  missing?: string[]
  rejected?: number
  reasons?: unknown[]
  populated?: number
  total?: number
  gaps?: string[]
}

export interface ReconResult {
  pipeline_run_id: string | null
  entity_id: string | null
  timestamp: string
  overall: 'pass' | 'warn' | 'fail'
  checks: ReconCheck[]
  detail?: string
  history_id?: number | null
}

export interface ReconHistoryEntry {
  id: number
  pipeline_run_id: string
  entity_id: string | null
  run_name: string | null
  overall: 'pass' | 'warn' | 'fail'
  created_at: string
}

export function fetchDclRecon(pipelineRunId: string): Promise<ReconResult> {
  return fetchJSON(`/api/pipeline/dcl-recon?pipeline_run_id=${encodeURIComponent(pipelineRunId)}`)
}

export function fetchReconHistory(limit = 20): Promise<ReconHistoryEntry[]> {
  return fetchJSON(`/api/pipeline/dcl-recon/history?limit=${limit}`)
}

export function fetchReconSnapshot(historyId: number): Promise<ReconResult> {
  return fetchJSON(`/api/pipeline/dcl-recon/history/${historyId}`)
}

// Baselines
export interface Baselines {
  [key: string]: number
}

export function fetchBaselines(): Promise<{ baselines: Baselines }> {
  return fetchJSON('/api/pipeline/config/baselines')
}

export function updateBaselines(baselines: Baselines): Promise<{ status: string }> {
  return fetchJSON('/api/pipeline/config/baselines', {
    method: 'PUT',
    body: JSON.stringify(baselines),
  })
}

// Engagements
export interface Engagement {
  engagement_id: string
  acquirer_entity_id: string
  target_entity_id: string
  tenant_id: string | null
  engagement_type: string
  lifecycle_stage: string
  state_json: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
  convergence_engagement_id: string | null
  engagement_short_name: string | null
}

// Convergence engagements — canonical source for ME pipeline
export interface ConvergenceEngagement {
  engagement_id: string
  acquirer_entity_id: string
  target_entity_id: string
  short_name: string
  tenant_id: string | null
  state: string
  created_at: string | null
}

export function fetchConvergenceEngagements(): Promise<{ engagements: ConvergenceEngagement[] }> {
  return fetchJSON('/api/proxy/convergence/api/convergence/engagements')
}

export function fetchEngagements(): Promise<{ engagements: Engagement[] }> {
  return fetchJSON('/api/engagements')
}

export function fetchEngagement(id: string): Promise<Engagement> {
  return fetchJSON(`/api/engagements/${id}`)
}

export function updateEngagement(
  id: string,
  data: { lifecycle_stage?: string; state_json?: Record<string, unknown> },
): Promise<Engagement> {
  return fetchJSON(`/api/engagements/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export interface EngagementHistoryEvent {
  timestamp: string | null
  source: string
  description: string
}

export function fetchEngagementHistory(id: string, limit = 50): Promise<{ events: EngagementHistoryEvent[] }> {
  return fetchJSON(`/api/engagements/${id}/history?limit=${limit}`)
}

export function createEngagement(data: {
  acquirer_entity_id: string
  target_entity_id: string
  engagement_type: string
}): Promise<Engagement> {
  return fetchJSON('/api/engagements', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// DCL proxy — routes through console backend to avoid CORS
export function fetchDclContext(): Promise<unknown> {
  return fetchJSON('/api/proxy/dcl/api/dcl/contextualization-summary')
}

export function fetchDclTriplesOverview(tenantId?: string): Promise<unknown> {
  const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''
  return fetchJSON(`/api/proxy/dcl/api/dcl/triples/overview${qs}`)
}

export function fetchDclContextualizationSummary(tenantId?: string): Promise<unknown> {
  const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''
  return fetchJSON(`/api/proxy/dcl/api/dcl/contextualization-summary${qs}`)
}

export function fetchDclCofaAdjustments(): Promise<unknown> {
  return fetchJSON('/api/proxy/dcl/api/dcl/reports/v2/cofa-adjustments')
}

export function fetchDclCombiningIncomeStatement(
  period = '2025-Q1',
): Promise<unknown> {
  return fetchJSON(`/api/proxy/dcl/api/dcl/reports/v2/combining/income-statement?period=${period}`)
}

export function fetchDclBridge(): Promise<unknown> {
  return fetchJSON('/api/proxy/dcl/api/dcl/reports/v2/bridge')
}

// Changes
export interface ChangeEvent {
  id: string
  timestamp: string
  source_module: string
  event_type: string
  entity_id: string | null
  summary: string
  detail: string | null
  severity: 'critical' | 'warning' | 'info'
  payload: Record<string, unknown>
  acknowledged: boolean
  created_at: string
}

export interface ChangeSummary {
  critical: number
  warning: number
  info: number
  last_scan: string | null
}

export function fetchChanges(params?: {
  since?: string
  severity?: string
  module?: string
  limit?: number
  acknowledged?: boolean
}): Promise<{ events: ChangeEvent[]; count: number }> {
  const qs = new URLSearchParams()
  if (params?.since) qs.set('since', params.since)
  if (params?.severity) qs.set('severity', params.severity)
  if (params?.module) qs.set('module', params.module)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.acknowledged !== undefined) qs.set('acknowledged', String(params.acknowledged))
  const query = qs.toString()
  return fetchJSON(`/api/changes${query ? `?${query}` : ''}`)
}

export function acknowledgeChange(eventId: string): Promise<{ status: string }> {
  return fetchJSON(`/api/changes/${eventId}/acknowledge`, { method: 'POST' })
}

export function fetchChangeSummary(): Promise<ChangeSummary> {
  return fetchJSON('/api/changes/summary')
}

export function triggerDetection(module: string): Promise<{ status: string; events_detected: number }> {
  return fetchJSON(`/api/changes/detect/${module}`, { method: 'POST' })
}

// Upload
export interface UploadResult {
  upload_id: string
  engagement_id: string | null
  entity_id: string
  file_name: string
  file_type: string
  file_size: number
  parse_result: {
    file_name?: string
    file_type?: string
    rows?: number
    accounts?: number
    periods?: number
    format?: string
    hierarchy_levels?: number
    validations?: { check: string; pass: boolean; detail: string }[]
    error?: string
  } | null
  status: string
  created_at: string | null
}

export async function uploadFile(
  file: File,
  entityId: string,
  engagementId?: string,
): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('entity_id', entityId)
  if (engagementId) form.append('engagement_id', engagementId)
  const resp = await fetch('/api/upload', { method: 'POST', body: form })
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`
    try { const b = await resp.json(); if (b.detail) detail = b.detail } catch {}
    throw new Error(detail)
  }
  return resp.json()
}

export function fetchUploadStatus(uploadId: string): Promise<UploadResult> {
  return fetchJSON(`/api/upload/status/${uploadId}`)
}

export function proceedUpload(uploadId: string): Promise<{ upload_id: string; status: string; conversion: Record<string, unknown> }> {
  return fetchJSON(`/api/upload/proceed/${uploadId}`, { method: 'POST' })
}

// Config
export function fetchConfig(): Promise<{ config: Record<string, unknown> }> {
  return fetchJSON('/api/config')
}

export function fetchCronLastRuns(): Promise<{ last_runs: Record<string, string | null> }> {
  return fetchJSON('/api/config/cron-last-runs')
}

export function updateConfig(data: Record<string, unknown>): Promise<{ status: string; config: Record<string, unknown> }> {
  return fetchJSON('/api/config', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// Instrumentation
export interface MaestraRun {
  run_id: string
  engagement_id: string | null
  step_name: string
  run_tag: string | null
  model_version: string | null
  constitution_version: string | null
  duration_s: number | null
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | null
  status: string
  error_detail: string | null
  created_at: string | null
}

export interface InstrumentationSummary {
  total_runs: number
  total_tokens: number
  total_cost: number
  avg_duration_s: number
}

export function fetchInstrumentationRuns(params?: {
  engagement_id?: string
  step_name?: string
  limit?: number
}): Promise<{ runs: MaestraRun[]; count: number }> {
  const qs = new URLSearchParams()
  if (params?.engagement_id) qs.set('engagement_id', params.engagement_id)
  if (params?.step_name) qs.set('step_name', params.step_name)
  if (params?.limit) qs.set('limit', String(params.limit))
  const query = qs.toString()
  return fetchJSON(`/api/instrumentation/runs${query ? `?${query}` : ''}`)
}

export function fetchInstrumentationSummary(engagementId?: string): Promise<InstrumentationSummary> {
  const qs = engagementId ? `?engagement_id=${engagementId}` : ''
  return fetchJSON(`/api/instrumentation/summary${qs}`)
}

// Conflicts
export interface Conflict {
  id: string
  engagement_id: string
  name: string
  impact_dollars: number
  impact_label: string
  severity: 'high' | 'medium' | 'low'
  status: 'pending' | 'resolved'
  treatment: string | null
}

export function fetchConflicts(engagementId: string): Promise<{ conflicts: Conflict[] }> {
  return fetchJSON(`/api/engagements/${engagementId}/conflicts`)
}

// Narrative
export interface NarrativeStep {
  id: string
  title: string
  phase: string
  description: string
  messages: { text: string; delay_ms: number }[]
}

export interface Narrative {
  steps: NarrativeStep[]
}

export function fetchNarrative(): Promise<{ narrative: Narrative }> {
  return fetchJSON('/api/narrative')
}

export function updateNarrative(narrative: Narrative): Promise<{ status: string; narrative: Narrative }> {
  return fetchJSON('/api/narrative', {
    method: 'PUT',
    body: JSON.stringify(narrative),
  })
}

// Maestra chat is handled by useMaestraStream hook — no client.ts function needed

// Operator Feed — Maestra plans (proxied from Platform)
export interface MaestraPlan {
  id: string
  tenant_id: string
  plan_type: 'tier_1_auto' | 'tier_2_validate' | 'tier_3_plan' | 'tier_4_escalate'
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'executed' | 'failed'
  title: string
  rationale: string
  customer_message: string
  affected_modules: string[]
  impact_analysis: string | null
  plan_body: Record<string, unknown> | null
  cc_prompt: string | null
  harness_expectations: string | null
  rollback_plan: string | null
  approved_by: string | null
  executed_at: string | null
  execution_log: Record<string, unknown> | null
  result_summary: string | null
  created_at: string
  updated_at: string
}

export interface MaestraPlansResponse {
  plans: MaestraPlan[]
  total: number
  limit: number
  offset: number
}

export function fetchOperatorFeedPlans(params: {
  tenant_id: string
  status?: string
  limit?: number
  offset?: number
}): Promise<MaestraPlansResponse> {
  const qs = new URLSearchParams()
  qs.set('tenant_id', params.tenant_id)
  if (params.status) qs.set('status', params.status)
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.offset) qs.set('offset', String(params.offset))
  return fetchJSON(`/api/operator-feed/plans?${qs.toString()}`)
}
