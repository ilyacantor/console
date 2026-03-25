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
