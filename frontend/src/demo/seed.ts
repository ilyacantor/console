/**
 * Crestline Wealth Partners — deployment tour seed.
 *
 * One fictional customer. Per-stage projections describe the environment
 * growing across the 9-stage tour. Pure data: no network, no DB, no side
 * effects. Consumed via useEnvSnapshot when a tour snapshot is active;
 * screens fall through to real APIs otherwise.
 */

// ===========================================================================
// Stage definitions (the canonical 9-stage sequence)
// ===========================================================================

export type StageId =
  | 'aod-scan'
  | 'synthetic-env'
  | 'credentials'
  | 'fabric-discovery'
  | 'two-panel-mapping'
  | 'semantic-layer'
  | 'consumption'
  | 'contextos'
  | 'close'

export interface Stage {
  id: StageId
  ordinal: number
  title: string
  dayRange: string
  targetRoute: string
  narration: string
  advanceLabel: string
}

export const STAGES: Stage[] = [
  {
    id: 'aod-scan',
    ordinal: 1,
    title: "Day 1 — See what's there",
    dayRange: 'Days 1–2',
    targetRoute: '/aod/inventory',
    narration:
      "AOD is scanning Crestline's environment. Apps appear as they're discovered, each tagged by governance and SOR score.",
    advanceLabel: 'Show synthetic shadow →',
  },
  {
    id: 'synthetic-env',
    ordinal: 2,
    title: 'Day 1–2 — Synthetic version',
    dayRange: 'Days 1–2',
    targetRoute: '/preview/synthetic',
    narration:
      'Same shape as the customer environment, synthetic data flowing, no real connections yet. One sample question answered end-to-end.',
    advanceLabel: 'Bring on credentials →',
  },
  {
    id: 'credentials',
    ordinal: 3,
    title: 'Days 2–7 — Credentials and Edge Agent',
    dayRange: 'Days 2–7',
    targetRoute: '/deploy/credentials',
    narration:
      "Mai produced the credential checklist. Each one is validated as it arrives. Edge Agent install command is ready; outbound HTTPS on 443 only.",
    advanceLabel: 'Discover the fabric →',
  },
  {
    id: 'fabric-discovery',
    ordinal: 4,
    title: 'Days 7–9 — Integration fabric',
    dayRange: 'Days 7–9',
    targetRoute: '/pipelines/catalog',
    narration:
      "Edge Agent is live. AAM connected to MuleSoft, Apigee, Confluent Kafka, and Snowflake. Pipes populate live. Direct connections cover what isn't on the fabric.",
    advanceLabel: 'Bring data in →',
  },
  {
    id: 'two-panel-mapping',
    ordinal: 5,
    title: 'Days 9–13 — Data in, mapped to meaning',
    dayRange: 'Days 9–13',
    targetRoute: '/mappings/review',
    narration:
      'Transport flowing on the left. LLM-proposed mappings on the right. A human confirms — that gate stays.',
    advanceLabel: 'Semantic layer live →',
  },
  {
    id: 'semantic-layer',
    ordinal: 6,
    title: 'Days 13–15 — Semantic layer live',
    dayRange: 'Days 13–15',
    targetRoute: '/inspect',
    narration:
      'Coverage builds across business areas. Every record carries provenance back to the source system.',
    advanceLabel: 'Plug into everything →',
  },
  {
    id: 'consumption',
    ordinal: 7,
    title: 'Days 13–15 — Plug into everything; ask in plain English',
    dayRange: 'Days 13–15',
    targetRoute: '/consumption',
    narration:
      'BI tools, Snowflake-as-source, agents over MCP, downstream systems — all connected to AOS. The galaxy answers in plain English.',
    advanceLabel: 'Open contextOS →',
  },
  {
    id: 'contextos',
    ordinal: 8,
    title: 'Days 15–30+ — contextOS',
    dayRange: 'Days 15–30+',
    targetRoute: '/contextos/config',
    narration:
      'The customer team works with AOS to define relationships, hierarchies, rollups. Duration is set by their availability.',
    advanceLabel: 'Recap the deployment →',
  },
  {
    id: 'close',
    ordinal: 9,
    title: 'Close — Full timeline',
    dayRange: 'Days 1–30+',
    targetRoute: '/tour/recap',
    narration:
      'From discovery to queryable in 15 days. contextOS layered 15–30+. The strip below shows the whole sequence.',
    advanceLabel: 'Exit tour',
  },
]

export const STAGE_BY_ID: Record<StageId, Stage> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
) as Record<StageId, Stage>

export function stageBefore(id: StageId): Stage | null {
  const s = STAGE_BY_ID[id]
  return s.ordinal > 1 ? STAGES[s.ordinal - 2] : null
}

export function stageAfter(id: StageId): Stage | null {
  const s = STAGE_BY_ID[id]
  return s.ordinal < STAGES.length ? STAGES[s.ordinal] : null
}

// ===========================================================================
// Company profile (display strings)
// ===========================================================================

export const COMPANY = {
  name: 'Crestline Wealth Partners',
  industry: 'Wealth management',
  employees: 2_500,
  apps_total: 47,
  sors_total: 6,
  fabric_vendors: 4,
}

// ===========================================================================
// AOD — discovered applications (47 total)
// ===========================================================================

export type Governance = 'managed' | 'shadow' | 'unmanaged'

export interface AodApp {
  app_id: string
  display_name: string
  vendor: string
  category: string
  governance: Governance
  sor_score: number
  is_sor: boolean
}

const SOR_APPS: AodApp[] = [
  { app_id: 'sfdc', display_name: 'Salesforce', vendor: 'Salesforce', category: 'CRM', governance: 'managed', sor_score: 0.97, is_sor: true },
  { app_id: 'wday', display_name: 'Workday', vendor: 'Workday', category: 'HRIS', governance: 'managed', sor_score: 0.95, is_sor: true },
  { app_id: 'nsut', display_name: 'NetSuite', vendor: 'Oracle', category: 'ERP/GL', governance: 'managed', sor_score: 0.96, is_sor: true },
  { app_id: 'snow', display_name: 'ServiceNow', vendor: 'ServiceNow', category: 'ITSM', governance: 'managed', sor_score: 0.92, is_sor: true },
  { app_id: 'crpm', display_name: 'Charles River IMS', vendor: 'State Street', category: 'Portfolio Mgmt', governance: 'managed', sor_score: 0.93, is_sor: true },
  { app_id: 'bill', display_name: 'Crestline Billing API', vendor: 'In-house', category: 'Billing', governance: 'managed', sor_score: 0.88, is_sor: true },
]

const SHADOW_APPS: AodApp[] = [
  { app_id: 'noti', display_name: 'Notion', vendor: 'Notion', category: 'Docs', governance: 'shadow', sor_score: 0.21, is_sor: false },
  { app_id: 'atbl', display_name: 'Airtable', vendor: 'Airtable', category: 'Onboarding tracker', governance: 'shadow', sor_score: 0.34, is_sor: false },
  { app_id: 'repl', display_name: 'Advisor Calculator', vendor: 'Replit-hosted', category: 'Calc tool', governance: 'shadow', sor_score: 0.18, is_sor: false },
  { app_id: 'pyet', display_name: 'Internal Python ETL', vendor: 'In-house', category: 'ETL', governance: 'unmanaged', sor_score: 0.42, is_sor: false },
]

const SECONDARY_APPS: AodApp[] = [
  ['slck', 'Slack', 'Salesforce', 'Comms', 'managed', 0.55],
  ['zoom', 'Zoom', 'Zoom', 'Comms', 'managed', 0.52],
  ['tabl', 'Tableau', 'Salesforce', 'BI', 'managed', 0.65],
  ['pbi-', 'Power BI', 'Microsoft', 'BI', 'managed', 0.62],
  ['look', 'Looker', 'Google', 'BI', 'managed', 0.60],
  ['o365', 'Office 365', 'Microsoft', 'Productivity', 'managed', 0.45],
  ['gwks', 'Google Workspace', 'Google', 'Productivity', 'managed', 0.48],
  ['okta', 'Okta', 'Okta', 'Identity', 'managed', 0.78],
  ['jira', 'Jira', 'Atlassian', 'Issue Tracking', 'managed', 0.50],
  ['conf', 'Confluence', 'Atlassian', 'Wiki', 'managed', 0.40],
  ['dsgn', 'DocuSign', 'DocuSign', 'eSign', 'managed', 0.55],
  ['snfk', 'Snowflake', 'Snowflake', 'Data Warehouse', 'managed', 0.85],
  ['kfka', 'Confluent Kafka', 'Confluent', 'Event Bus', 'managed', 0.80],
  ['mule', 'MuleSoft', 'Salesforce', 'iPaaS', 'managed', 0.82],
  ['apig', 'Apigee', 'Google', 'API Gateway', 'managed', 0.78],
  ['gith', 'GitHub', 'GitHub', 'SCM', 'managed', 0.65],
  ['cstr', 'CrowdStrike', 'CrowdStrike', 'EDR', 'managed', 0.62],
  ['splk', 'Splunk', 'Splunk', 'SIEM', 'managed', 0.68],
  ['ddog', 'Datadog', 'Datadog', 'Observability', 'managed', 0.58],
  ['pndo', 'Pendo', 'Pendo', 'Product Analytics', 'managed', 0.45],
  ['mrkt', 'Marketo', 'Adobe', 'Marketing Automation', 'managed', 0.70],
  ['hbsp', 'HubSpot', 'HubSpot', 'Marketing', 'managed', 0.65],
  ['mlmp', 'Mailchimp', 'Intuit', 'Email', 'shadow', 0.35],
  ['cnly', 'Calendly', 'Calendly', 'Scheduling', 'shadow', 0.28],
  ['lnkn', 'LinkedIn Sales Nav', 'LinkedIn', 'Sales Intel', 'managed', 0.45],
  ['zinf', 'ZoomInfo', 'ZoomInfo', 'Sales Intel', 'managed', 0.42],
  ['asna', 'Asana', 'Asana', 'PM', 'shadow', 0.32],
  ['trel', 'Trello', 'Atlassian', 'PM', 'shadow', 0.25],
  ['figm', 'Figma', 'Figma', 'Design', 'managed', 0.40],
  ['miro', 'Miro', 'Miro', 'Whiteboard', 'shadow', 0.30],
  ['loom', 'Loom', 'Loom', 'Video', 'shadow', 0.22],
  ['1psw', '1Password', '1Password', 'Secrets', 'managed', 0.72],
  ['lpas', 'LastPass', 'LastPass', 'Secrets', 'shadow', 0.18],
  ['strp', 'Stripe', 'Stripe', 'Payments', 'managed', 0.85],
  ['plad', 'Plaid', 'Plaid', 'Banking', 'managed', 0.82],
  ['sgmt', 'Segment', 'Twilio', 'CDP', 'managed', 0.75],
  ['adbs', 'Adobe Sign', 'Adobe', 'eSign', 'managed', 0.52],
].map(([id, name, vendor, cat, gov, score]) => ({
  app_id: id as string,
  display_name: name as string,
  vendor: vendor as string,
  category: cat as string,
  governance: gov as Governance,
  sor_score: score as number,
  is_sor: false,
}))

export const ALL_APPS: AodApp[] = [...SOR_APPS, ...SHADOW_APPS, ...SECONDARY_APPS]

export function aodAppsAtStage(stageId: StageId): AodApp[] {
  const ord = STAGE_BY_ID[stageId].ordinal
  if (ord < 1) return []
  return ALL_APPS
}

// ===========================================================================
// Synthetic environment — sample question answered end-to-end
// ===========================================================================

export interface SampleQuestionAnswer {
  question: string
  answer_summary: string
  rows: Array<{ label: string; value: string }>
  lineage_chain: string[]
  source_label: string
}

export const SYNTHETIC_SAMPLE: SampleQuestionAnswer = {
  question: 'What is our total assets under management for Q3?',
  answer_summary: 'Total AUM for Q3 is $4.82B across 6,140 client accounts.',
  rows: [
    { label: 'Q3 AUM', value: '$4.82B' },
    { label: 'vs Q2', value: '+$210M (+4.6%)' },
    { label: 'Accounts', value: '6,140' },
    { label: 'Top advisor', value: 'M. Tanaka — $612M' },
  ],
  lineage_chain: [
    'Farm synthetic',
    'Charles River IMS (synthetic shadow)',
    'NetSuite GL (synthetic shadow)',
    'Concept: Account.AUM',
  ],
  source_label: 'Farm synthetic — no real customer data connected yet',
}

// ===========================================================================
// Credentials checklist (47 entries, validated progressively)
// ===========================================================================

export interface CredentialItem {
  app_id: string
  app_name: string
  required_credential: string
  validated_by_stage_ordinal: number | null
  status_note: string
}

const _credBlueprint: Array<[string, string, number | null, string]> = [
  ['sfdc', 'OAuth client credentials', 3, 'Validated against Salesforce sandbox'],
  ['wday', 'ISU + SOAP token', 3, 'Workday Studio ISU provisioned'],
  ['nsut', 'TBA key + secret', 3, 'NetSuite TBA flow complete'],
  ['snow', 'OAuth integration user', 3, 'ServiceNow integration user active'],
  ['crpm', 'MSSQL service account', 4, 'Charles River read-only SQL login (network approval Day 8)'],
  ['bill', 'Bearer token', 3, 'Custom billing API token issued'],
  ['snfk', 'Service user + key-pair', 3, 'Snowflake key-pair auth wired'],
  ['kfka', 'mTLS client cert', 4, 'Confluent mTLS cert (CA approval Day 8)'],
  ['mule', 'Connected app credentials', 3, 'MuleSoft connected app issued'],
  ['apig', 'Service account JWT', 3, 'Apigee service account provisioned'],
  ['okta', 'OAuth + API token', 3, 'Okta read-only role'],
  ['tabl', 'Personal access token', 3, 'Tableau PAT issued'],
  ['pbi-', 'Service principal', 4, 'Azure SP needed CISO sign-off'],
  ['look', 'API client + secret', 3, 'Looker API credentials issued'],
  ['noti', 'Internal integration token', 4, 'Shadow app — workspace admin approval'],
  ['atbl', 'PAT', 4, 'Airtable PAT scoped to onboarding base'],
  ['repl', 'No credentials available', null, 'Replit-hosted; flagged for retirement'],
  ['pyet', 'No credentials available', null, 'Unmanaged Python ETL; flagged for retirement'],
]

export const CREDENTIALS: CredentialItem[] = ALL_APPS.map((app) => {
  const bp = _credBlueprint.find((b) => b[0] === app.app_id)
  if (bp) {
    return {
      app_id: app.app_id,
      app_name: app.display_name,
      required_credential: bp[1],
      validated_by_stage_ordinal: bp[2],
      status_note: bp[3],
    }
  }
  return {
    app_id: app.app_id,
    app_name: app.display_name,
    required_credential: 'OAuth or API key',
    validated_by_stage_ordinal: 3,
    status_note: 'Standard SaaS credential flow',
  }
})

export interface CredentialsAtStage {
  validated: number
  pending: number
  blocked: number
  total: number
  items: CredentialItem[]
}

export function credentialsAtStage(stageId: StageId): CredentialsAtStage {
  const ord = STAGE_BY_ID[stageId].ordinal
  let validated = 0
  let blocked = 0
  for (const c of CREDENTIALS) {
    if (c.validated_by_stage_ordinal === null) {
      blocked += 1
    } else if (c.validated_by_stage_ordinal <= ord) {
      validated += 1
    }
  }
  return {
    validated,
    blocked,
    pending: CREDENTIALS.length - validated - blocked,
    total: CREDENTIALS.length,
    items: CREDENTIALS,
  }
}

export const EDGE_AGENT_INSTALL_COMMAND =
  'curl -fsSL https://edge.aos.example.com/install.sh | sudo TENANT=crestline OUTBOUND=https://edge-relay.aos.example.com:443 bash'

// ===========================================================================
// Pipes (fabric + direct) — 78 fabric + 4 direct surfaced as 18 representatives
// ===========================================================================

export type FabricPlane = 'iPaaS' | 'API Gateway' | 'Event Bus' | 'Data Warehouse' | 'Direct'
export type Modality = 'REST' | 'GraphQL' | 'SOAP' | 'Kafka' | 'SQL' | 'WebSocket' | 'File/SFTP'

export interface SeedPipe {
  pipe_id: string
  display_name: string
  vendor: string
  source_system: string
  fabric_plane: FabricPlane
  modality: Modality
  identity_keys: string[]
  introduced_at_stage_ordinal: number
}

export const SEED_PIPES: SeedPipe[] = [
  { pipe_id: 'mule-sfdc-acct', display_name: 'Salesforce Account', vendor: 'MuleSoft', source_system: 'Salesforce', fabric_plane: 'iPaaS', modality: 'REST', identity_keys: ['account_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'mule-sfdc-opp', display_name: 'Salesforce Opportunity', vendor: 'MuleSoft', source_system: 'Salesforce', fabric_plane: 'iPaaS', modality: 'REST', identity_keys: ['opportunity_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'mule-wday-wkr', display_name: 'Workday Worker', vendor: 'MuleSoft', source_system: 'Workday', fabric_plane: 'iPaaS', modality: 'SOAP', identity_keys: ['employee_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'mule-nsut-gl', display_name: 'NetSuite GL Journal', vendor: 'MuleSoft', source_system: 'NetSuite', fabric_plane: 'iPaaS', modality: 'REST', identity_keys: ['journal_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'apig-snow-incd', display_name: 'ServiceNow Incident', vendor: 'Apigee', source_system: 'ServiceNow', fabric_plane: 'API Gateway', modality: 'REST', identity_keys: ['incident_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'apig-bill-inv', display_name: 'Billing Invoice', vendor: 'Apigee', source_system: 'Crestline Billing API', fabric_plane: 'API Gateway', modality: 'REST', identity_keys: ['invoice_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'kfka-sfdc-events', display_name: 'Salesforce CDC stream', vendor: 'Confluent', source_system: 'Salesforce', fabric_plane: 'Event Bus', modality: 'Kafka', identity_keys: ['account_id', 'change_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'kfka-bill-evts', display_name: 'Billing event stream', vendor: 'Confluent', source_system: 'Crestline Billing API', fabric_plane: 'Event Bus', modality: 'Kafka', identity_keys: ['invoice_id', 'event_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'snfk-port-snap', display_name: 'Portfolio snapshot', vendor: 'Snowflake', source_system: 'Charles River IMS', fabric_plane: 'Data Warehouse', modality: 'SQL', identity_keys: ['account_id', 'as_of'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'snfk-gl-rollup', display_name: 'GL rollup', vendor: 'Snowflake', source_system: 'NetSuite', fabric_plane: 'Data Warehouse', modality: 'SQL', identity_keys: ['gl_period'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'snfk-hrm-hist', display_name: 'Worker history', vendor: 'Snowflake', source_system: 'Workday', fabric_plane: 'Data Warehouse', modality: 'SQL', identity_keys: ['employee_id', 'effective_dt'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'snfk-cust-aum', display_name: 'Client AUM rollup', vendor: 'Snowflake', source_system: 'Charles River IMS', fabric_plane: 'Data Warehouse', modality: 'SQL', identity_keys: ['account_id', 'as_of'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'mule-okta-usr', display_name: 'Okta User', vendor: 'MuleSoft', source_system: 'Okta', fabric_plane: 'iPaaS', modality: 'REST', identity_keys: ['user_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'apig-snow-cmdb', display_name: 'ServiceNow CMDB CI', vendor: 'Apigee', source_system: 'ServiceNow', fabric_plane: 'API Gateway', modality: 'REST', identity_keys: ['ci_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'direct-crpm-trd', display_name: 'Charles River Trades (direct)', vendor: 'State Street', source_system: 'Charles River IMS', fabric_plane: 'Direct', modality: 'SQL', identity_keys: ['trade_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'direct-crpm-pos', display_name: 'Charles River Positions (direct)', vendor: 'State Street', source_system: 'Charles River IMS', fabric_plane: 'Direct', modality: 'SQL', identity_keys: ['position_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'direct-bill-rest', display_name: 'Crestline Billing REST (direct)', vendor: 'In-house', source_system: 'Crestline Billing API', fabric_plane: 'Direct', modality: 'REST', identity_keys: ['invoice_id'], introduced_at_stage_ordinal: 4 },
  { pipe_id: 'direct-bill-ws', display_name: 'Crestline Billing WebSocket (direct)', vendor: 'In-house', source_system: 'Crestline Billing API', fabric_plane: 'Direct', modality: 'WebSocket', identity_keys: ['session_id'], introduced_at_stage_ordinal: 4 },
]

export const FABRIC_PIPE_COUNT_TOTAL = 78
export const DIRECT_PIPE_COUNT_TOTAL = 4

export function pipesAtStage(stageId: StageId): {
  visible: SeedPipe[]
  fabric_count: number
  direct_count: number
} {
  const ord = STAGE_BY_ID[stageId].ordinal
  if (ord < 4) {
    return { visible: [], fabric_count: 0, direct_count: 0 }
  }
  return {
    visible: SEED_PIPES,
    fabric_count: FABRIC_PIPE_COUNT_TOTAL,
    direct_count: DIRECT_PIPE_COUNT_TOTAL,
  }
}

export const MCP_VENDOR_SERVERS = [
  { vendor: 'Snowflake', server_label: 'Snowflake MCP', kind: 'inbound query' },
  { vendor: 'MuleSoft', server_label: 'MuleSoft MCP', kind: 'inbound metadata' },
]

// ===========================================================================
// Mappings (412 total, ~16 representative samples)
// ===========================================================================

export type MappingStatus = 'proposed' | 'confirmed' | 'rejected' | 'auto_applied'

export interface SeedMapping {
  id: string
  pipe_id: string
  vendor: string
  source_system: string
  source_field: string
  concept: string
  property: string
  confidence: number
  reasoning: string
  confirmed_at_stage_ordinal: number | null
}

export const SEED_MAPPINGS: SeedMapping[] = [
  { id: 'm-001', pipe_id: 'mule-sfdc-acct', vendor: 'MuleSoft', source_system: 'Salesforce', source_field: 'Account.Name', concept: 'Client', property: 'display_name', confidence: 0.98, reasoning: 'Direct 1:1 match — Salesforce Account.Name is the canonical client display name across CRM exports.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-002', pipe_id: 'mule-sfdc-acct', vendor: 'MuleSoft', source_system: 'Salesforce', source_field: 'Account.Industry', concept: 'Client', property: 'segment', confidence: 0.91, reasoning: 'Maps to client segment taxonomy after enum normalization (Financial Services → "FinServ").', confirmed_at_stage_ordinal: 5 },
  { id: 'm-003', pipe_id: 'mule-wday-wkr', vendor: 'MuleSoft', source_system: 'Workday', source_field: 'Worker.Employee_ID', concept: 'Employee', property: 'employee_id', confidence: 0.99, reasoning: 'Workday Employee_ID is the canonical HR identifier.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-004', pipe_id: 'mule-wday-wkr', vendor: 'MuleSoft', source_system: 'Workday', source_field: 'Worker.Hire_Date', concept: 'Employee', property: 'hire_date', confidence: 0.97, reasoning: 'Direct date mapping; ISO-8601 normalization applied.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-005', pipe_id: 'mule-nsut-gl', vendor: 'MuleSoft', source_system: 'NetSuite', source_field: 'Journal.Amount', concept: 'GLEntry', property: 'amount', confidence: 0.96, reasoning: 'Amounts always in account currency; FX conversion handled downstream.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-006', pipe_id: 'snfk-cust-aum', vendor: 'Snowflake', source_system: 'Charles River IMS', source_field: 'CR_PORTFOLIO.AUM_USD', concept: 'Account', property: 'aum', confidence: 0.94, reasoning: 'Already in USD; reconciles with NetSuite GL at month-end.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-007', pipe_id: 'snfk-cust-aum', vendor: 'Snowflake', source_system: 'Charles River IMS', source_field: 'CR_PORTFOLIO.ADVISOR_CODE', concept: 'Account', property: 'advisor_id', confidence: 0.89, reasoning: 'Advisor code joins to Workday Employee_ID via crosswalk table.', confirmed_at_stage_ordinal: 6 },
  { id: 'm-008', pipe_id: 'apig-bill-inv', vendor: 'Apigee', source_system: 'Crestline Billing API', source_field: 'invoice.account_id', concept: 'Invoice', property: 'account_id', confidence: 0.97, reasoning: 'Account ID is a Salesforce external ID embedded in billing.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-009', pipe_id: 'apig-bill-inv', vendor: 'Apigee', source_system: 'Crestline Billing API', source_field: 'invoice.fee_amount', concept: 'Invoice', property: 'fee_amount', confidence: 0.95, reasoning: 'USD; advisor fee schedule applied upstream.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-010', pipe_id: 'kfka-sfdc-events', vendor: 'Confluent', source_system: 'Salesforce', source_field: 'cdc.field_change.AnnualRevenue', concept: 'Client', property: 'annual_revenue', confidence: 0.82, reasoning: 'CDC stream — needs HITL because field semantics drift across Salesforce releases.', confirmed_at_stage_ordinal: 6 },
  { id: 'm-011', pipe_id: 'direct-crpm-trd', vendor: 'State Street', source_system: 'Charles River IMS', source_field: 'TRADES.TRADE_DATE', concept: 'Trade', property: 'trade_date', confidence: 0.96, reasoning: 'MSSQL DATETIME normalized to ISO date.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-012', pipe_id: 'direct-crpm-pos', vendor: 'State Street', source_system: 'Charles River IMS', source_field: 'POSITIONS.MARKET_VALUE', concept: 'Position', property: 'market_value', confidence: 0.93, reasoning: 'USD market value reconciles with Snowflake nightly roll-up.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-013', pipe_id: 'apig-snow-incd', vendor: 'Apigee', source_system: 'ServiceNow', source_field: 'incident.short_description', concept: 'Incident', property: 'summary', confidence: 0.87, reasoning: 'ServiceNow short_description maps to incident summary.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-014', pipe_id: 'mule-okta-usr', vendor: 'MuleSoft', source_system: 'Okta', source_field: 'User.profile.email', concept: 'Employee', property: 'email', confidence: 0.99, reasoning: 'Okta primary email is canonical for the employee directory.', confirmed_at_stage_ordinal: 5 },
  { id: 'm-015', pipe_id: 'snfk-gl-rollup', vendor: 'Snowflake', source_system: 'NetSuite', source_field: 'GL_ROLLUP.NET_INCOME', concept: 'Financials', property: 'net_income', confidence: 0.92, reasoning: 'Pre-aggregated nightly; reconciles with NetSuite source within 0.1%.', confirmed_at_stage_ordinal: 6 },
  { id: 'm-016', pipe_id: 'apig-bill-inv', vendor: 'Apigee', source_system: 'Crestline Billing API', source_field: 'invoice.custom.discount_pct', concept: 'Invoice', property: '?', confidence: 0.62, reasoning: 'Low confidence — custom field, no canonical concept match. HITL required.', confirmed_at_stage_ordinal: null },
]

export const MAPPING_TOTAL = 412

export function mappingsAtStage(stageId: StageId): {
  confirmed: number
  proposed: number
  total: number
  visible: Array<SeedMapping & { status: MappingStatus }>
} {
  const ord = STAGE_BY_ID[stageId].ordinal
  // Counts: Day 9 (stage 4) = 0/412, Day 13 (stage 5) = 312/412, Day 15 (stage 6+) = 412/412.
  let confirmed = 0
  if (ord >= 6) confirmed = 412
  else if (ord >= 5) confirmed = 312
  const visible = SEED_MAPPINGS.map((m) => {
    let status: MappingStatus
    if (m.confirmed_at_stage_ordinal === null) status = 'proposed'
    else if (ord >= m.confirmed_at_stage_ordinal && ord >= 6) status = 'auto_applied'
    else if (ord >= m.confirmed_at_stage_ordinal) status = 'confirmed'
    else status = 'proposed'
    return { ...m, status }
  })
  return {
    confirmed,
    proposed: MAPPING_TOTAL - confirmed,
    total: MAPPING_TOTAL,
    visible,
  }
}

// ===========================================================================
// Semantic coverage by business domain
// ===========================================================================

export interface DomainCoverage {
  domain: string
  concepts_total: number
  records_total: number
  confidence: 'high' | 'medium' | 'low'
  available_from_stage_ordinal: number
}

export const COVERAGE_DOMAINS: DomainCoverage[] = [
  { domain: 'Client (CRM)', concepts_total: 28, records_total: 6_140, confidence: 'high', available_from_stage_ordinal: 6 },
  { domain: 'HR', concepts_total: 22, records_total: 2_500, confidence: 'high', available_from_stage_ordinal: 6 },
  { domain: 'Finance (GL)', concepts_total: 34, records_total: 184_220, confidence: 'high', available_from_stage_ordinal: 6 },
  { domain: 'IT (CMDB)', concepts_total: 18, records_total: 3_420, confidence: 'medium', available_from_stage_ordinal: 6 },
  { domain: 'Risk', concepts_total: 14, records_total: 11_500, confidence: 'medium', available_from_stage_ordinal: 6 },
  { domain: 'Portfolio', concepts_total: 26, records_total: 142_900, confidence: 'high', available_from_stage_ordinal: 6 },
  { domain: 'Billing', concepts_total: 12, records_total: 28_400, confidence: 'high', available_from_stage_ordinal: 6 },
]

export function coverageAtStage(stageId: StageId): DomainCoverage[] {
  const ord = STAGE_BY_ID[stageId].ordinal
  return COVERAGE_DOMAINS.filter((d) => ord >= d.available_from_stage_ordinal)
}

// Per-record provenance examples (rendered as ribbons on coverage rows).
export interface ProvenanceChain {
  domain: string
  example_record: string
  chain: string[]
  confidence: number
}

export const PROVENANCE_EXAMPLES: ProvenanceChain[] = [
  { domain: 'Portfolio', example_record: 'Account#A-1042 AUM $612.4M', chain: ['Charles River IMS', 'Snowflake snfk-cust-aum', 'concept: Account.aum'], confidence: 0.94 },
  { domain: 'Client (CRM)', example_record: 'Client#C-208 segment=FinServ', chain: ['Salesforce Account.Industry', 'MuleSoft mule-sfdc-acct', 'concept: Client.segment'], confidence: 0.91 },
  { domain: 'Finance (GL)', example_record: 'GL Q3 Net Income $48.2M', chain: ['NetSuite GL_ROLLUP.NET_INCOME', 'Snowflake snfk-gl-rollup', 'concept: Financials.net_income'], confidence: 0.92 },
  { domain: 'HR', example_record: 'Employee#E-771 advisor M. Tanaka', chain: ['Workday Worker.Employee_ID', 'MuleSoft mule-wday-wkr', 'concept: Employee.employee_id'], confidence: 0.99 },
]

// ===========================================================================
// Plug-in destinations + canned galaxy answer
// ===========================================================================

export interface PluginDestination {
  category: 'BI' | 'Warehouse' | 'Agent' | 'Downstream SaaS'
  display_name: string
  vendor: string
  status: 'connected' | 'configured' | 'available'
  note: string
}

export const PLUGIN_DESTINATIONS: PluginDestination[] = [
  { category: 'BI', display_name: 'Tableau', vendor: 'Salesforce', status: 'connected', note: 'Live dataset connection' },
  { category: 'BI', display_name: 'Power BI', vendor: 'Microsoft', status: 'connected', note: 'DirectQuery to AOS semantic layer' },
  { category: 'BI', display_name: 'Looker', vendor: 'Google', status: 'configured', note: 'LookML model generated' },
  { category: 'Warehouse', display_name: 'Snowflake as source', vendor: 'Snowflake', status: 'connected', note: 'Shared dataset for advisor desktops' },
  { category: 'Agent', display_name: 'Claude (Anthropic)', vendor: 'Anthropic', status: 'connected', note: 'MCP server endpoint live' },
  { category: 'Agent', display_name: 'Internal agent (custom)', vendor: 'In-house', status: 'configured', note: 'Token-scoped MCP access' },
  { category: 'Downstream SaaS', display_name: 'Marketo', vendor: 'Adobe', status: 'configured', note: 'Audience sync ready' },
  { category: 'Downstream SaaS', display_name: 'HubSpot', vendor: 'HubSpot', status: 'available', note: 'Awaiting customer enablement' },
]

export interface GalaxyAnswerRow {
  advisor: string
  aum_q3: string
  delta_vs_q2: string
  clients: number
  tenure_yrs: number
}

export const GALAXY_CANNED_ANSWER = {
  question: 'Show our top-5 advisors by AUM in Q3 with sourced lineage.',
  rows: [
    { advisor: 'M. Tanaka', aum_q3: '$612.4M', delta_vs_q2: '+$31.2M', clients: 84, tenure_yrs: 12 },
    { advisor: 'R. Okonkwo', aum_q3: '$548.7M', delta_vs_q2: '+$18.9M', clients: 71, tenure_yrs: 9 },
    { advisor: 'A. Bergstrom', aum_q3: '$502.1M', delta_vs_q2: '-$4.3M', clients: 66, tenure_yrs: 15 },
    { advisor: 'J. Patel', aum_q3: '$471.8M', delta_vs_q2: '+$22.7M', clients: 58, tenure_yrs: 7 },
    { advisor: 'S. Vega', aum_q3: '$439.5M', delta_vs_q2: '+$11.4M', clients: 62, tenure_yrs: 11 },
  ] as GalaxyAnswerRow[],
  lineage: [
    'Charles River IMS · CR_PORTFOLIO.AUM_USD',
    'Snowflake · snfk-cust-aum',
    'Concept: Account.aum',
    'Joined via Workday Employee_ID → advisor crosswalk',
  ],
  related: [
    'Client count per advisor (Salesforce)',
    'Advisor tenure (Workday)',
    'Q3 net new client AUM (Charles River trade events)',
  ],
}

// ===========================================================================
// contextOS placeholder panels
// ===========================================================================

export interface ContextOsPanel {
  title: string
  description: string
  example_entries: string[]
}

export const CONTEXTOS_PANELS: ContextOsPanel[] = [
  {
    title: 'Relationships',
    description: 'How business concepts relate to each other (e.g., Advisor owns Account; Account holds Position).',
    example_entries: [
      'Advisor — owns → Account (cardinality: 1:N)',
      'Account — holds → Position (cardinality: 1:N)',
      'Client — has → Account (cardinality: 1:N)',
      'Trade — settles_into → Position (cardinality: N:1)',
    ],
  },
  {
    title: 'Hierarchies',
    description: 'Where rollups happen — organizational, geographic, or product structures the business reasons in.',
    example_entries: [
      'Region → Office → Advisor → Account',
      'Asset Class → Strategy → Fund → Position',
      'Cost Center → Department → Team → Employee',
    ],
  },
  {
    title: 'Rollups',
    description: 'Pre-defined aggregations the business uses for reporting and conversation.',
    example_entries: [
      'Advisor AUM = sum(Account.aum) where Account.advisor_id = Advisor.id',
      'Office Revenue = sum(Invoice.fee_amount) where Account.office_id = Office.id',
      'Firm-wide net flows = sum(Trade.net_amount) for the period',
    ],
  },
]
