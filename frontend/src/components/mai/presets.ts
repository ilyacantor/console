/**
 * Mai preset suggestions — config-driven, per page context.
 */

const GENERIC_PRESETS: Record<string, string[]> = {
  pipeline: [
    "What's the pipeline status?",
    'When was the last run?',
    'What entities are configured?',
    'How does the pipeline work?',
  ],
  changes: [
    'What changed in the last 24 hours?',
    'Are there any critical alerts?',
    'What caused the latest drift?',
    'How does change detection work?',
  ],
  inspect: [
    'What domains have data?',
    'How many triples are in the store?',
    "What's the coverage breakdown?",
    'Show me the biggest unresolved conflicts',
  ],
  dashboards: [
    'What data is available for dashboards?',
    'How is revenue trending?',
    'What financial domains are covered?',
  ],
  upload: [
    'What file formats are supported?',
    'How does GL parsing work?',
    'What validations run on upload?',
  ],
}

export interface PresetContext {
  pageKey: string
  route?: string
}

export function buildPresets(ctx: PresetContext): string[] {
  return GENERIC_PRESETS[ctx.pageKey] ?? []
}

export default GENERIC_PRESETS
