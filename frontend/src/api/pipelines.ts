// Pipelines API client — Console operator surfaces over the AAM → DCL
// pipeline. Each function calls a Console backend route which proxies (with
// identity propagation + structured failure surfaces) to AAM or DCL.

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

// ----- Catalog -----

export interface CatalogPipe {
  pipe_id: string
  display_name: string
  vendor: string
  source_system: string
  fabric_plane: string
  modality: string
  identity_keys: string[]
}

export interface CatalogResponse {
  pipes: CatalogPipe[]
  count: number
}

export function fetchCatalog(): Promise<CatalogResponse> {
  return fetchJSON('/api/pipelines/catalog')
}

// ----- Mappings -----

export interface MappingField {
  source_field: string
  concept: string
  property: string
  confidence: number
  tier: 'auto' | 'review' | 'low'
  approved: boolean
  needs_click: boolean
  rationale: string
}

export interface MappingPack {
  pack_key: string
  display_name: string
  fields: MappingField[]
}

export interface MappingsResponse {
  packs: MappingPack[]
  count: number
}

export function fetchMappings(): Promise<MappingsResponse> {
  return fetchJSON('/api/pipelines/mappings')
}

export function approveMapping(packKey: string, sourceField: string, approved: boolean = true): Promise<{
  pack_key: string
  source_field: string
  approved: boolean
  confidence: number
}> {
  return fetchJSON('/api/pipelines/mappings/approve', {
    method: 'POST',
    body: JSON.stringify({ pack_key: packKey, source_field: sourceField, approved }),
  })
}

// ----- Identity review queue (WP3) -----

export interface IdentityPendingRow {
  hitl_queue_id: string
  tenant_id: string
  entity_id: string
  domain: string
  left_pipe_id: string
  left_record_key: string
  left_value: string
  right_pipe_id: string | null
  right_record_key: string | null
  right_value: string
  proposed_canonical_id: string
  confidence: number
  status: string
  extra?: Record<string, unknown>
}

export interface IdentityPendingResponse {
  tenant_id: string
  entity_id: string | null
  domain: string | null
  count: number
  pending: IdentityPendingRow[]
}

export function fetchIdentityPending(params: {
  tenant_id: string
  entity_id?: string
  domain?: string
  limit?: number
}): Promise<IdentityPendingResponse> {
  const qs = new URLSearchParams()
  qs.set('tenant_id', params.tenant_id)
  if (params.entity_id) qs.set('entity_id', params.entity_id)
  if (params.domain) qs.set('domain', params.domain)
  if (params.limit) qs.set('limit', String(params.limit))
  return fetchJSON(`/api/pipelines/identity/pending?${qs.toString()}`)
}

export function postIdentityDecision(params: {
  hitl_queue_id: string
  decision: 'approved' | 'rejected'
  decided_by: string
}): Promise<{
  hitl_queue_id: string
  decision: string
  decided_by: string
  status: string
  tenant_id: string
  entity_id: string
  proposed_canonical_id: string
  triples_promoted: number
}> {
  return fetchJSON('/api/pipelines/identity/decision', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface IdentityAuditEntry {
  event: string
  details: Record<string, unknown>
  actor: string | null
  ts: string
}

export interface IdentityAuditResponse {
  hitl_queue_id: string
  tenant_id: string
  entity_id: string
  domain: string
  status: string
  confidence: number
  proposed_canonical_id: string
  audit: IdentityAuditEntry[]
}

export function fetchIdentityAudit(hitl_queue_id: string): Promise<IdentityAuditResponse> {
  const qs = new URLSearchParams({ hitl_queue_id })
  return fetchJSON(`/api/pipelines/identity/audit?${qs.toString()}`)
}

// ----- Consumer drill-through (MCP client to DCL) -----

export interface ConsumerTriple {
  triple_id?: string
  id?: string
  concept?: string
  property?: string
  entity_id?: string
  period?: string | null
  value?: unknown
  source_system?: string
  source_field?: string
  pipe_id?: string
  confidence_score?: number
  dcl_ingest_id?: string
  is_active?: boolean
  [key: string]: unknown
}

export function consumerQuery(params: {
  tenant_id: string
  entity_id?: string
  domain?: string
  concept?: string
  period?: string
  limit?: number
  active_only?: boolean
}): Promise<{ triples: ConsumerTriple[]; count?: number; [key: string]: unknown }> {
  return fetchJSON('/api/pipelines/consumer/query', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface ProvenanceSource {
  source_system: string
  source_field: string
  pipe_id: string
  confidence_score: number
  dcl_ingest_id?: string
  [key: string]: unknown
}

export function consumerProvenance(params: {
  tenant_id: string
  triple_id?: string
  concept?: string
  property?: string
  entity_id?: string
  period?: string
}): Promise<{ sources: ProvenanceSource[]; [key: string]: unknown }> {
  return fetchJSON('/api/pipelines/consumer/provenance', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}
