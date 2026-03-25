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

// Pipeline
export interface PipelineStep {
  name: string
  display_name: string
  status: string
  duration_s: number | null
  triples: number | null
  error: string | null
  detail: string | null
}

export interface PipelineRun {
  run_id: string
  mode: string
  entity_ids: string[]
  steps: PipelineStep[]
  total_duration_s: number | null
  total_triples: number | null
  status: string
  created_at?: string
}

export function runPipeline(mode: string, entities: string[]): Promise<PipelineRun> {
  return fetchJSON('/api/pipeline/run', {
    method: 'POST',
    body: JSON.stringify({ mode, entities }),
  })
}

export function resetPipeline(): Promise<{ status: string }> {
  return fetchJSON('/api/pipeline/reset', { method: 'POST' })
}

export function fetchRuns(limit = 20): Promise<{ runs: PipelineRun[] }> {
  return fetchJSON(`/api/pipeline/runs?limit=${limit}`)
}

export function fetchRun(runId: string): Promise<PipelineRun> {
  return fetchJSON(`/api/pipeline/runs/${runId}`)
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
  entity_ids: string[]
  engagement_type: string
  lifecycle_stage: string
  state_json: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
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

// DCL proxy — routes through console backend to avoid CORS
export function fetchDclContext(): Promise<unknown> {
  return fetchJSON('/api/proxy/dcl/api/dcl/contextualization-summary')
}

export function fetchDclTriplesOverview(): Promise<unknown> {
  return fetchJSON('/api/proxy/dcl/api/dcl/triples/overview')
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
