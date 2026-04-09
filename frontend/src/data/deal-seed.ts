/**
 * Seed data for Deal cockpit and Inspect COFA merge tab.
 * Used when DCL endpoints are unavailable or haven't been run yet.
 * NOT inline — stored here per spec requirement.
 */

export interface Conflict {
  id: string
  name: string
  impact_dollars: number
  impact_label: string
  severity: 'high' | 'medium' | 'low'
  status: 'pending' | 'resolved'
  treatment: string | null
}

export interface Deliverable {
  id: number
  name: string
  status: 'ready' | 'blocked' | 'waiting'
  block_reason: string | null
  depends_on: string
  gate_stage: string
}

export interface CombiningRow {
  label: string
  meridian: number
  cascadia: number
  adjustment: number
  combined: number
  bold: boolean
  cofa_link: string | null
  heavy_border_top: boolean
}

export interface StatementStatus {
  label: string
  status_text: string
  percent: number
  color: 'green' | 'amber' | 'gray'
}

export interface Gate {
  label: string
  status: 'pass' | 'pending' | 'fail'
}

export interface CofaMergeRow {
  unified_account: string
  meridian_account: string
  cascadia_account: string
  match_type: 'exact' | 'semantic' | 'manual' | 'conflict' | 'missing'
  confidence: number
  mapping_basis: string
  match_reasoning: string
  conflict_id: string | null
}

export const SEED_CONFLICTS: Conflict[] = [
  { id: 'COFA-001', name: 'Revenue gross/net recognition', impact_dollars: 340_000_000, impact_label: '$340M', severity: 'high', status: 'pending', treatment: null },
  { id: 'COFA-002', name: 'Benefits loading (COGS vs OpEx)', impact_dollars: 89_000_000, impact_label: '$89M', severity: 'medium', status: 'pending', treatment: null },
  { id: 'COFA-004', name: 'Recruiting capitalization', impact_dollars: 12_000_000, impact_label: '$12M', severity: 'medium', status: 'pending', treatment: null },
  { id: 'COFA-003', name: 'S&M bundling', impact_dollars: 28_000_000, impact_label: '$28M', severity: 'low', status: 'resolved', treatment: 'Acq. treatment' },
  { id: 'COFA-005', name: 'Automation capitalization', impact_dollars: 8_000_000, impact_label: '$8M', severity: 'low', status: 'resolved', treatment: 'Keep both' },
  { id: 'COFA-006', name: 'Depreciation method', impact_dollars: 4_000_000, impact_label: '$4M', severity: 'low', status: 'resolved', treatment: 'Post-close' },
]

export const SEED_DELIVERABLES: Deliverable[] = [
  { id: 1, name: 'COFA mapping table', status: 'ready', block_reason: null, depends_on: 'Map stage', gate_stage: 'map' },
  { id: 2, name: 'Conflict register', status: 'ready', block_reason: null, depends_on: 'Map stage', gate_stage: 'map' },
  { id: 3, name: 'Combining P&L', status: 'blocked', block_reason: '3 conflicts', depends_on: 'All conflicts resolved', gate_stage: 'combine' },
  { id: 4, name: 'Combining BS', status: 'blocked', block_reason: null, depends_on: 'All conflicts resolved', gate_stage: 'combine' },
  { id: 5, name: 'Combining CF', status: 'blocked', block_reason: 'P&L + BS', depends_on: 'Deliverables 3, 4', gate_stage: 'combine' },
  { id: 6, name: 'EBITDA bridge', status: 'blocked', block_reason: null, depends_on: 'Combining FS', gate_stage: 'combine' },
  { id: 7, name: 'QofE analysis', status: 'ready', block_reason: null, depends_on: 'Bridge data', gate_stage: 'deliver' },
  { id: 8, name: 'Entity resolution', status: 'ready', block_reason: null, depends_on: 'Enrichment data', gate_stage: 'deliver' },
  { id: 9, name: 'Overlap & concentration', status: 'ready', block_reason: null, depends_on: 'Entity resolution', gate_stage: 'deliver' },
  { id: 10, name: 'Cross-sell pipeline', status: 'ready', block_reason: null, depends_on: 'Overlap', gate_stage: 'deliver' },
]

export const SEED_COMBINING_PNL: CombiningRow[] = [
  { label: 'Revenue', meridian: 5100, cascadia: 1030, adjustment: -340, combined: 5790, bold: false, cofa_link: 'COFA-001', heavy_border_top: false },
  { label: 'COGS', meridian: -3111, cascadia: -731, adjustment: 89, combined: -3753, bold: false, cofa_link: 'COFA-002', heavy_border_top: false },
  { label: 'Gross profit', meridian: 1989, cascadia: 299, adjustment: -251, combined: 2037, bold: true, cofa_link: null, heavy_border_top: false },
  { label: 'OpEx', meridian: -1224, cascadia: -196, adjustment: 45, combined: -1375, bold: false, cofa_link: null, heavy_border_top: false },
  { label: 'EBITDA', meridian: 765, cascadia: 103, adjustment: -56, combined: 812, bold: true, cofa_link: null, heavy_border_top: true },
]

export const SEED_COMBINING_STATUS: StatementStatus[] = [
  { label: 'P&L', status_text: 'Blocked — 3 conflicts', percent: 70, color: 'amber' },
  { label: 'BS', status_text: 'Blocked — 3 conflicts', percent: 65, color: 'amber' },
  { label: 'CF', status_text: 'Waiting on P&L + BS', percent: 20, color: 'gray' },
  { label: 'Trial balance', status_text: 'DR = CR verified', percent: 100, color: 'green' },
]

export const SEED_GATES: Gate[] = [
  { label: 'DR = CR', status: 'pass' },
  { label: 'Revenue identity', status: 'pass' },
  { label: 'BS identity (A=L+E)', status: 'pass' },
  { label: 'Cash continuity', status: 'pending' },
]

export const SEED_COFA_MERGE: CofaMergeRow[] = [
  { unified_account: 'Revenue — consulting', meridian_account: '4100 Consulting revenue', cascadia_account: '5010 Professional services', match_type: 'semantic', confidence: 0.94, mapping_basis: 'Service type alignment', match_reasoning: 'Both accounts represent professional consulting service revenue streams', conflict_id: null },
  { unified_account: 'Revenue — managed svc', meridian_account: '4200 Managed services', cascadia_account: '5020 Outsourced delivery', match_type: 'semantic', confidence: 0.91, mapping_basis: 'Delivery model alignment', match_reasoning: 'Ongoing managed service delivery revenue in both entities', conflict_id: null },
  { unified_account: 'COGS — direct labor', meridian_account: '5100 Consultant comp', cascadia_account: '6010 Delivery staff comp', match_type: 'semantic', confidence: 0.89, mapping_basis: 'Direct labor cost alignment', match_reasoning: 'Direct labor cost for service delivery professionals', conflict_id: null },
  { unified_account: 'COGS — benefits', meridian_account: '—', cascadia_account: '6020 Delivery benefits', match_type: 'conflict', confidence: 0.45, mapping_basis: 'Classification mismatch', match_reasoning: 'Meridian classifies delivery benefits under OpEx (6100); Cascadia under COGS', conflict_id: 'COFA-002' },
  { unified_account: 'OpEx — benefits', meridian_account: '6100 Employee benefits', cascadia_account: '—', match_type: 'conflict', confidence: 0.45, mapping_basis: 'Classification mismatch', match_reasoning: 'Counter-entry to COGS benefits conflict — same underlying cost, different classification', conflict_id: 'COFA-002' },
  { unified_account: 'OpEx — S&M', meridian_account: '6200 Sales & marketing', cascadia_account: '7010 Bus dev + 7020 Mktg', match_type: 'semantic', confidence: 0.87, mapping_basis: 'Function alignment', match_reasoning: 'Cascadia splits S&M across two accounts; Meridian uses one', conflict_id: null },
]

/**
 * Recompute deliverable statuses based on current conflict state.
 * If all conflicts are resolved, deliverables 3-6 become "ready".
 */
export function recomputeDeliverables(
  conflicts: Conflict[],
  deliverables: Deliverable[],
): Deliverable[] {
  const pendingCount = conflicts.filter((c) => c.status === 'pending').length
  const allResolved = pendingCount === 0

  return deliverables.map((d) => {
    if (d.id >= 3 && d.id <= 6) {
      if (allResolved) {
        return { ...d, status: 'ready' as const, block_reason: null }
      }
      const reason = d.id === 5 ? 'P&L + BS' : d.id === 6 ? 'Combining FS' : `${pendingCount} conflict${pendingCount > 1 ? 's' : ''}`
      return { ...d, status: 'blocked' as const, block_reason: reason }
    }
    return d
  })
}

/**
 * Recompute combining status based on conflict state.
 */
export function recomputeCombiningStatus(
  conflicts: Conflict[],
  statuses: StatementStatus[],
): StatementStatus[] {
  const pendingCount = conflicts.filter((c) => c.status === 'pending').length
  const allResolved = pendingCount === 0

  return statuses.map((s) => {
    if (s.label === 'Trial balance') return s
    if (allResolved) {
      return { ...s, status_text: 'Complete', percent: 100, color: 'green' as const }
    }
    if (s.label === 'CF') {
      return { ...s, status_text: 'Waiting on P&L + BS', percent: 20, color: 'gray' as const }
    }
    return {
      ...s,
      status_text: `Blocked — ${pendingCount} conflict${pendingCount > 1 ? 's' : ''}`,
      percent: s.label === 'P&L' ? 70 : 65,
      color: 'amber' as const,
    }
  })
}
