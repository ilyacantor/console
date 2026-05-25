/**
 * Per-stage Mai configuration for the deployment tour.
 *
 * - `presets`: chip suggestions shown when chat is empty during the stage.
 * - `system_addition`: extra context Mai should weave into responses
 *   (delivered via surface-state `extras.tour_mai_addition`).
 * - `decline_rule`: what Mai should redirect during this stage
 *   (delivered via surface-state `extras.tour_mai_decline_rule`).
 *
 * Read by MaiPanel to populate presets, and read by Mai herself via
 * `get_surface_state` to bias her responses.
 */

import type { StageId } from './seed'

export interface MaiStageConfig {
  presets: string[]
  system_addition: string
  decline_rule: string
}

export const MAI_STAGE_CONFIG: Record<StageId, MaiStageConfig> = {
  'aod-scan': {
    presets: [
      "What's an SOR score?",
      'Why is Notion tagged shadow?',
      'How long does discovery usually take?',
    ],
    system_addition:
      'Discovery just started against Crestline. 47 apps found so far; 6 tagged systems of record. No data is connected yet.',
    decline_rule:
      "If the operator asks about real numbers (AUM, revenue, advisors), explain that no data is connected yet. The first synthetic preview arrives at Day 2.",
  },
  'synthetic-env': {
    presets: [
      'Why synthetic first?',
      'Is this customer data?',
      'What changes when real credentials arrive?',
    ],
    system_addition:
      'Numbers in this stage are Farm synthetic — same shape as real Crestline data, but not connected. State that on every numeric answer.',
    decline_rule:
      'Do not present synthetic numbers as if they were real. Always say "synthetic" or "Farm preview" in the same sentence.',
  },
  credentials: {
    presets: [
      'What does the Edge Agent do?',
      'Why outbound-only?',
      "What's blocking the remaining credentials?",
    ],
    system_addition:
      'Edge Agent tunnel is outbound HTTPS on 443 only. No inbound ports. Credentials arrive on a customer-network-approval cadence.',
    decline_rule:
      'Decline questions that require live source-system data — real data does not start flowing until Day 9 (fabric).',
  },
  'fabric-discovery': {
    presets: [
      "What's the difference between fabric and direct-connect?",
      'Why does the MCP callout matter?',
      'Show me Charles River.',
    ],
    system_addition:
      'AAM scanned the fabric. Pipes catalogued across MuleSoft, Apigee, Confluent Kafka, and Snowflake. Direct connections cover non-fabric systems (Charles River MSSQL, Crestline Billing).',
    decline_rule:
      "Don't propose semantic mappings here. Mapping starts at Day 9 and goes through a human-confirm queue.",
  },
  'two-panel-mapping': {
    presets: [
      'Why does a human confirm?',
      'What does confidence 0.92 mean?',
      'Which fields are stuck?',
    ],
    system_addition:
      'LLM proposes mappings; a human confirms. That gate is policy, not a bottleneck to remove.',
    decline_rule:
      'Do not suggest "Mai should just accept" the low-confidence mappings. The HITL gate is the spec.',
  },
  'semantic-layer': {
    presets: [
      "What's the coverage in Risk?",
      'Show me lineage for AUM.',
      "What's still unmapped?",
    ],
    system_addition:
      'Coverage is real for this stage. Per-record provenance is on every row. Cite Inspect → Coverage when asked for detail.',
    decline_rule: '',
  },
  consumption: {
    presets: [
      'Ask the top-5 advisors question',
      'Which BI tools are wired?',
      'What does MCP mean here?',
      'Can agents write back?',
    ],
    system_addition:
      'Plug-in destinations are connected read-side. No write-back in this demo state. The galaxy answer for top-5 advisors is canned from seeded data.',
    decline_rule:
      'Write-back questions: not in scope for this deployment phase. State that plainly.',
  },
  contextos: {
    presets: [
      'What goes in contextOS?',
      'How does this change answers?',
      'Who configures this?',
    ],
    system_addition:
      'contextOS is customer-led, AOS-supported. Timeline is the customer team\'s.',
    decline_rule:
      "Don't promise specific rollup behaviors — those are customer-defined.",
  },
  close: {
    presets: [
      'Recap the timeline',
      'What was the longest stage?',
      'What changes for the next customer?',
    ],
    system_addition:
      'Recap mode. Crestline went from zero to queryable in 15 days; contextOS layered 15–30+.',
    decline_rule:
      'Sales-promise questions ("guaranteed in 15 days?") → "Timelines depend on customer credential and network approval velocity."',
  },
}
