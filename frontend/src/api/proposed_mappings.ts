// WS-5 B4 — proposed_mappings (LLM-proposed field mappings) API client.
// Calls through the Console proxy at /aam/api/aam/proposed-mappings.

export interface ProposedMapping {
  tenant_id: string
  source_system: string
  vendor: string
  source_field: string
  concept: string | null
  property: string | null
  confidence: number | null
  reasoning: string | null
  model_id: string
  status: 'proposed' | 'failed' | 'capped' | 'no_proposal'
  created_at: string
  updated_at: string
}

export interface ProposedMappingsResponse {
  count: number
  status_counts: Record<string, number>
  proposals: ProposedMapping[]
}

export async function fetchProposedMappings(opts?: {
  statuses?: string[]
  limit?: number
  tenantId?: string
}): Promise<ProposedMappingsResponse> {
  const params = new URLSearchParams()
  if (opts?.statuses) {
    for (const s of opts.statuses) params.append('status', s)
  }
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.tenantId) params.set('tenant_id', opts.tenantId)
  const qs = params.toString()
  // Console proxy mount: /api/proxy/{module}/{path} → upstream module.
  const url = `/api/proxy/aam/api/aam/proposed-mappings${qs ? '?' + qs : ''}`
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' } })
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
